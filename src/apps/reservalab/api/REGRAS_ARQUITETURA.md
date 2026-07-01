# Regras de Arquitetura — ReservaLab UAM
# Cole este arquivo no opencode antes de pedir qualquer mudança na API ou backend.

## Stack do Projeto
- **Backend:** Flask (Python) em `app.py` — único processo que sobe tudo
- **Frontend:** React + Vite em `frontend/` — buildado para `frontend/dist/`
- **Deploy:** Vercel (Python Serverless)
- **Dados:** Planilhas Excel no SharePoint, acessadas via URL nas env vars

## Estrutura de Arquivos Importantes
```
planilha/
├── app.py              ← Servidor Flask principal. TODAS as rotas /api/* ficam aqui.
├── api/
│   └── index.py        ← Entry point da Vercel (não mexa aqui)
├── frontend/
│   ├── src/
│   │   ├── App.jsx     ← Componente raiz. Só busca /api/reservas aqui.
│   │   ├── layouts/    ← Telas: Dashboard.jsx, FigmaReservas.jsx
│   │   ├── components/ ← Componentes reutilizáveis: Navbar.jsx, etc.
│   │   └── hooks/      ← useIsMobile.js e outros hooks
│   └── public/
│       └── manifest.json ← Configuração PWA
├── vercel.json         ← Configuração de build/rotas da Vercel
└── .env                ← Variáveis de ambiente (nunca commitar)
```

## REGRAS CRÍTICAS — Nunca Viole

### Backend (Python)

1. **Toda rota `/api/` DEVE estar no `app.py`.**
   Nunca crie um Flask separado em outro arquivo. Outros arquivos só têm funções puras.

2. **Cada módulo novo segue este template OBRIGATÓRIO:**
```python
# api/meu_modulo.py — SEM Flask, SEM app = Flask()
import logging
logger = logging.getLogger(__name__)

def get_meus_dados(parametro=None):
    try:
        # lógica aqui
        return {'dados': [...], 'total': N}
    except Exception as e:
        logger.error(f"Erro: {e}")
        return {'error': str(e), 'dados': [], 'total': 0}  # NUNCA levante exceção!
```

3. **Para registrar um novo módulo no app.py, use SEMPRE este padrão:**
```python
import importlib.util as _ilu
_mod_path = os.path.join(BASE_DIR, 'api', 'meu_modulo.py')
_mod_spec = _ilu.spec_from_file_location('meu_modulo', _mod_path)
_mod = _ilu.module_from_spec(_mod_spec)

try:
    _mod_spec.loader.exec_module(_mod)

    @app.route('/api/minha-rota', methods=['GET'])
    def api_minha_rota():
        return jsonify(_mod.get_meus_dados())

    logger.info("Módulo carregado.")
except Exception as _e:
    logger.error(f"Módulo não carregado: {_e}")
    # O resto do app continua funcionando!
```

4. **Cache com objetos date SEMPRE usa o `DateEncoder`:**
```python
json.dump(data, f, cls=DateEncoder)
```

5. **Variáveis de ambiente** ficam no `.env` e nas env vars da Vercel.
   Use `os.environ.get('NOME_VAR', '')` — nunca coloque valores fixos no código.

### Frontend (React)

6. **Cada tela busca seus próprios dados com `useEffect` interno.**
   O `App.jsx` só busca `/api/reservas`.
   Nunca centralize todos os fetches no `App.jsx`.

7. **Use `React.lazy()` para novas telas** — já está configurado em `App.jsx`.
   ```jsx
   const NovaTela = lazy(() => import('./layouts/NovaTela'))
   ```

8. **Componentes novos vão em `frontend/src/components/`**
   e são exportados pelo `frontend/src/components/index.js`.

### Deploy

9. **Fluxo de deploy SEMPRE:**
   ```
   npm run build (dentro de frontend/)
   git add .
   git commit -m "descrição"
   git push origin main
   ```
   A Vercel detecta o push e faz o deploy automaticamente.

10. **Nunca delete o projeto da Vercel.** Se o deploy quebrar, veja os logs na
    dashboard da Vercel em: vercel.com → seu projeto → Deployments → clique no deploy → Functions

## Variáveis de Ambiente Necessárias
| Variável | Onde | Descrição |
|---|---|---|
| `SHAREPOINT_URL` | `.env` + Vercel | URL da planilha de reservas |

## Como Adicionar uma Nova API (passo a passo seguro)

1. Crie `api/nova_api.py` com funções puras (sem Flask)
2. Teste o import: `python -c "from api.nova_api import get_dados; print('OK')"`
3. Registre no `app.py` usando o padrão do item 3 acima
4. Teste o servidor: `python -c "import app; print('OK')"`
5. Inicie o servidor e teste: `curl http://localhost:5000/api/nova-rota`
6. Faça build e push

## Bugs Conhecidos e Correções Já Aplicadas
- `Object of type date is not JSON serializable` → Resolvido com `DateEncoder` em `app.py`
- Navbar muito alta no iPhone → Resolvido com `env(safe-area-inset-top)` no CSS
- Tela branca no PWA → Causada por cache do browser; solução: reinstalar o app da tela de início
