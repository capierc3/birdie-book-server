export type ScoreRelation = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double'

export function getScoreRelation(score: number, par: number): ScoreRelation {
  const diff = score - par
  if (diff <= -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  return 'double'
}

export function getScoreClass(score: number, par: number): string {
  return `score-${getScoreRelation(score, par)}`
}
