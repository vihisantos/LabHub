import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getCol,
  setCol,
  initDB,
  isNamespacedKey,
  NAMESPACE_SEPARATOR,
  resetCache,
} from '../db'
import { namespacedCollectionKey, currentUserCollectionKey } from '../cacheNamespace'
import { setTestUser } from '../../test/mocks'

/**
 * #344 — camada de baixo do cache namespaced: chave, forma e `initDB`.
 *
 * O store é key→valor sem `keyPath`, então a chave É o namespace. Estes testes
 * cobrem a parte que `ticketService` dá por garantida: que `chamados` e
 * `chamados:<uuid>` são duas chaves distintas, que uma não se resolve na outra, e
 * que o `initDB` não as transforma numa coleção lógica única.
 *
 * A distinção importa por causa do rollout: a Vercel faz deploy gradual, e uma
 * aba com o JS antigo ainda lê `chamados`. O código novo tem de conviver com a
 * chave legada sem nunca adotá-la.
 */

const WS_X = 'ws-x'

/**
 * Stub mínimo de `indexedDB`, só com o que `initDB` usa.
 *
 * O projeto não tem `fake-indexeddb` como dependência e jsdom não expõe
 * IndexedDB, então `initDB` nunca foi testado. Adicionar a dependência ficaria
 * fora do escopo da #344; um stub de ~20 linhas exercita o caminho real
 * (`getAllKeys` → `get` por chave → `CACHE.set`) sem inventar um banco.
 *
 * Duas sutilezas do stub:
 *
 *   · os callbacks disparam em `queueMicrotask`, e não em `setTimeout` — o setup
 *     global do projeto instala timers falsos, e um `setTimeout` aqui nunca
 *     dispararia;
 *   · o disparo é assíncrono de propósito. `initDB` faz
 *     `indexedDB.open(...).onsuccess = …`, então um callback síncrono rodaria
 *     antes de o handler ser atribuído e a promise nunca resolveria — que é o
 *     comportamento do IndexedDB real.
 *
 * A garantia que este teste cobre é estrutural: cada chave do store vira uma
 * entrada PRÓPRIA do `CACHE`. Não depende de detalhes de transação.
 */
function stubIndexedDB(data: Record<string, unknown>) {
  const request = (result: unknown) => {
    const r: any = { result, onsuccess: null, onerror: null }
    queueMicrotask(() => r.onsuccess?.())
    return r
  }
  const store = {
    getAllKeys: () => request(Object.keys(data)),
    get: (key: string) => request(data[key]),
    put: (_value: unknown, key: string) => {
      // `setCol` grava depois da hidratação; refletir aqui mantém o store e o
      // `CACHE` coerentes dentro do teste.
      data[key] = _value
      return request(undefined)
    },
  }
  const transaction = () => {
    // `oncomplete` como setter: `initDB` faz `await new Promise(r => { tx.oncomplete
    // = r })`, e o executor é síncrono — então disparar na atribuição resolve a
    // promise. Disparar antes (em microtask) perderia a corrida, porque o handler
    // ainda não estaria atribuído.
    let done = false
    return {
      objectStore: () => store,
      set oncomplete(fn: () => void) {
        if (done) return
        done = true
        queueMicrotask(fn)
      },
    }
  }
  ;(globalThis as any).indexedDB = {
    open: () => request({ transaction }),
  }
}

beforeEach(() => {
  resetCache()
  setTestUser({ id: 'user-a', workspace_ids: [WS_X] } as any)
})

afterEach(() => {
  delete (globalThis as any).indexedDB
})

describe('#344 — a forma da chave', () => {
  it('namespace e coleção são chaves diferentes', () => {
    const key = namespacedCollectionKey('chamados', 'user-a')
    expect(key).not.toBe('chamados')
    expect(key).toBe(`chamados${NAMESPACE_SEPARATOR}user-a`)
  })

  it('isNamespacedKey separa as duas sem ambiguidade', () => {
    expect(isNamespacedKey('chamados')).toBe(false)
    expect(isNamespacedKey('chamados:user-a')).toBe(true)
    // userId vazio não é namespace válido.
    expect(isNamespacedKey('chamados:')).toBe(false)
    // O separador nunca aparece no início, então nada colide com `chamados`.
    expect(isNamespacedKey(':user-a')).toBe(false)
    expect(isNamespacedKey('')).toBe(false)
  })

  it('cada usuário tem chave própria e nenhuma colide', () => {
    const keys = ['user-a', 'user-b', 'user-c'].map((u) => namespacedCollectionKey('chamados', u))
    expect(new Set(keys).size).toBe(3)
    keys.forEach((k) => expect(isNamespacedKey(k)).toBe(true))
  })
})

describe('#344 — as chaves não se misturam', () => {
  it('setCol em uma chave não aparece na outra', () => {
    const keyA = namespacedCollectionKey('chamados', 'user-a')
    const keyB = namespacedCollectionKey('chamados', 'user-b')

    setCol(keyA, [{ id: 't-a1' }])

    expect(getCol(keyA)).toHaveLength(1)
    expect(getCol(keyB)).toEqual([])
    // E a legada continua vazia — a escrita em namespace não a cria.
    expect(getCol('chamados')).toEqual([])
  })

  it('a chave legada existe e não é alcançável pelo namespace', () => {
    setCol('chamados', [{ id: 't-legado' }])
    const keyA = namespacedCollectionKey('chamados', 'user-a')

    // Ela existe no armazenamento…
    expect(getCol('chamados')).toHaveLength(1)
    // …e o namespace não a alcança.
    expect(getCol(keyA)).toEqual([])
    expect(currentUserCollectionKey('chamados')).toBe(keyA)
  })

  it('um usuário não consegue montar a chave de outro pelo resolvedor', () => {
    // O gancho (`resolveKey`) não recebe identidade: ele só pergunta ao auth.
    // Não há como pedir o cache de A sem trocarem a sessão.
    setTestUser({ id: 'user-a' } as any)
    expect(currentUserCollectionKey('chamados')).toBe('chamados:user-a')

    setTestUser({ id: 'user-b' } as any)
    expect(currentUserCollectionKey('chamados')).toBe('chamados:user-b')
  })
})

describe('#344 — initDB não transforma as chaves numa coleção só', () => {
  it('carrega cada chave na própria entrada, sem mesclar legado e namespace', async () => {
    // As três formas de chave coexistem no store, como numa instalação real
    // depois do rollout (aba antiga gravou `chamados`, a nova grava por usuário).
    stubIndexedDB({
      chamados: [{ id: 'legado' }],
      'chamados:user-a': [{ id: 'de-a' }],
      'chamados:user-b': [{ id: 'de-b' }],
    })
    await initDB()

    expect(getCol('chamados').map((t: any) => t.id)).toEqual(['legado'])
    expect(getCol('chamados:user-a').map((t: any) => t.id)).toEqual(['de-a'])
    expect(getCol('chamados:user-b').map((t: any) => t.id)).toEqual(['de-b'])
  })

  it('re-hidratar não faz o usuário atual adotar o legado', async () => {
    stubIndexedDB({ chamados: [{ id: 'legado' }] })
    await initDB()

    // A sessão é de A: o que ela resolve é `chamados:user-a`, que não existe
    // ainda — vazio, e não o conteúdo de dono desconhecido.
    setTestUser({ id: 'user-a' } as any)
    expect(currentUserCollectionKey('chamados')).toBe('chamados:user-a')
    expect(getCol(currentUserCollectionKey('chamados')!)).toEqual([])
    // A legada segue lá, intacta e inerte.
    expect(getCol('chamados')).toHaveLength(1)
  })

  it('só as chaves do próprio usuário são escritas depois do reload', async () => {
    stubIndexedDB({ 'chamados:user-a': [{ id: 'de-a' }] })
    await initDB()

    setTestUser({ id: 'user-a' } as any)
    setCol(currentUserCollectionKey('chamados')!, [{ id: 'novo-de-a' }])

    // A escrita foi para `chamados:user-a`, que agora tem o registro novo. Nenhuma
    // outra chave foi criada — a legada em particular não volta.
    expect(getCol('chamados:user-a')).toEqual([{ id: 'novo-de-a' }])
    expect(getCol('chamados')).toEqual([])
  })
})
