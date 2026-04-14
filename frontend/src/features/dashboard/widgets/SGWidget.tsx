import { useSGSummary } from '../../../api'
import { SGSummaryCard } from '../SGSummaryCard'

export function SGWidget() {
  const { data: sgData } = useSGSummary()
  if (!sgData) return null
  return <SGSummaryCard data={sgData} />
}
