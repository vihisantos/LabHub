import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAssets } from '../hooks/useAssets'
import { ARCHITECTURE_LABELS, ASSET_STATUS_LABELS, OPERATING_SYSTEM_LABELS, STORAGE_TYPE_LABELS } from '../types'

export function PCDetail() {
  const { id } = useParams(); const navigate = useNavigate(); const { assets, loading } = useAssets(); const asset = assets.find((item) => item.id === id)
  const children = useMemo(() => asset ? assets.filter((item) => item.parentAssetId === asset.id || asset.childAssetIds.includes(item.id)) : [], [asset, assets])
  if (loading) return null
  if (!asset) return <div className="py-12 text-center"><p className="text-sm text-fg-muted">Ativo não encontrado.</p><button type="button" onClick={() => navigate('/pc-care/assets')} className="mt-3 text-sm text-violet-500">Voltar ao inventário</button></div>
  const technical = asset.technical; const network = asset.network
  return <div><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs text-fg-muted">{asset.equipmentType}</p><h2 className="text-xl font-semibold">{asset.assetTag}</h2><p className="text-sm text-fg-muted">{asset.manufacturer} {asset.model}</p></div><span className="rounded-lg bg-input px-3 py-1 text-sm text-fg-dim">{ASSET_STATUS_LABELS[asset.status]}</span></div>
    <div className="space-y-3"><Section title="Identificação"><Grid values={[['Patrimônio', asset.assetTag], ['Tipo', asset.equipmentType], ['Fabricante', asset.manufacturer], ['Modelo', asset.model], ['Número de série', asset.serialNumber], ['Localização', asset.location]]} /></Section>
      <Section title="Informações técnicas"><Grid values={[['Sistema operacional', technical.operatingSystem ? OPERATING_SYSTEM_LABELS[technical.operatingSystem] : '—'], ['Arquitetura', technical.architecture ? ARCHITECTURE_LABELS[technical.architecture] : '—'], ['Processador', technical.processor], ['Memória RAM', technical.memory], ['Armazenamento', [technical.storageType && STORAGE_TYPE_LABELS[technical.storageType], technical.storageCapacity, technical.storageBrand].filter(Boolean).join(' · ')]]} /></Section>
      <Section title="Rede"><Grid values={[['Hostname', network.hostname], ['IP', network.ip], ['MAC Ethernet', network.macEthernet], ['MAC Wi-Fi', network.macWifi], ['Domínio', network.domain]]} /></Section>
      <Section title="Ativos vinculados">{children.length ? <div className="space-y-2">{children.map((child) => <button key={child.id} type="button" onClick={() => navigate(`/pc-care/assets/${child.id}`)} className="flex w-full items-center justify-between rounded-lg bg-input p-3 text-left"><span><b>{child.assetTag}</b><span className="ml-2 text-sm text-fg-muted">{child.equipmentType} · {child.manufacturer} {child.model}</span></span><span className="text-xs text-fg-muted">Ver</span></button>)}</div> : <p className="text-sm text-fg-muted">Nenhum ativo relacionado. A estrutura de relacionamento já está pronta para o vínculo entre ativos.</p>}</Section>
      <Section title="Observações"><p className="whitespace-pre-wrap text-sm text-fg">{asset.observations}</p></Section>
      <div className="flex gap-3 pt-2"><button type="button" onClick={() => navigate('/pc-care/assets')} className="flex-1 rounded-lg border border-line py-2 text-sm">Voltar</button><button type="button" onClick={() => navigate(`/pc-care/assets/${asset.id}/edit`)} className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white">Editar</button></div>
    </div></div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-line bg-card/50 p-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</h3>{children}</section> }
function Grid({ values }: { values: [string, string][] }) { return <div className="grid gap-3 text-sm sm:grid-cols-2">{values.filter(([, value]) => value).map(([label, value]) => <div key={label}><p className="text-xs text-fg-muted">{label}</p><p className="break-words text-fg">{value || '—'}</p></div>)}</div> }
