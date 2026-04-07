import { Fragment } from 'react'
import { Button } from '../../components'
import type { RangeShotResponse } from '../../api'
import { formatNum } from '../../utils/format'
import styles from './RangeDetailPage.module.css'

interface Props {
  primaryShot: RangeShotResponse
  compareShot: RangeShotResponse | null
  compareMode: boolean
  onClose: () => void
  onToggleCompare: () => void
  onSwap: () => void
}

interface FieldDef {
  label: string
  key: string
  unit?: string
  decimals?: number
}

const PANEL_SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Flight',
    fields: [
      { label: 'Carry', key: 'carry_yards', unit: 'yds' },
      { label: 'Total', key: 'total_yards', unit: 'yds' },
      { label: 'Side', key: 'side_carry_yards', unit: 'yds' },
      { label: 'Side Tot', key: 'side_total_yards', unit: 'yds' },
      { label: 'Apex', key: 'apex_yards', unit: 'yds' },
      { label: 'Curve', key: 'curve_yards', unit: 'yds' },
      { label: 'Hang Time', key: 'hang_time_sec', unit: 's' },
      { label: 'Descent', key: 'descent_angle_deg', unit: '\u00b0' },
    ],
  },
  {
    title: 'Club & Swing',
    fields: [
      { label: 'Club Spd', key: 'club_speed_mph', unit: 'mph' },
      { label: 'Ball Spd', key: 'ball_speed_mph', unit: 'mph' },
      { label: 'Smash', key: 'smash_factor', decimals: 2 },
      { label: 'Attack', key: 'attack_angle_deg', unit: '\u00b0' },
      { label: 'Club Path', key: 'club_path_deg', unit: '\u00b0' },
      { label: 'Face Ang', key: 'face_angle_deg', unit: '\u00b0' },
      { label: 'F2P', key: 'face_to_path_deg', unit: '\u00b0' },
      { label: 'Dyn Loft', key: 'dynamic_loft_deg', unit: '\u00b0' },
      { label: 'Spin Loft', key: 'spin_loft_deg', unit: '\u00b0' },
      { label: 'Swing Pl', key: 'swing_plane_deg', unit: '\u00b0' },
      { label: 'Swing Dir', key: 'swing_direction_deg', unit: '\u00b0' },
      { label: 'Dyn Lie', key: 'dynamic_lie_deg', unit: '\u00b0' },
    ],
  },
  {
    title: 'Impact',
    fields: [
      { label: 'Offset', key: 'impact_offset_in', unit: 'in' },
      { label: 'Height', key: 'impact_height_in', unit: 'in' },
      { label: 'Low Point', key: 'low_point_distance_in', unit: 'in' },
    ],
  },
  {
    title: 'Spin',
    fields: [
      { label: 'Rate', key: 'spin_rate_rpm', unit: 'rpm', decimals: 0 },
      { label: 'Axis', key: 'spin_axis_deg', unit: '\u00b0' },
      { label: 'Launch', key: 'launch_angle_deg', unit: '\u00b0' },
      { label: 'Launch Dir', key: 'launch_direction_deg', unit: '\u00b0' },
    ],
  },
]

function getVal(shot: RangeShotResponse, key: string): number | null {
  return (shot as unknown as Record<string, unknown>)[key] as number | null ?? null
}

function fmtVal(val: number | null, decimals = 1): string {
  if (val == null) return '\u2014'
  return formatNum(val, decimals)
}

function fmtDelta(a: number | null, b: number | null, decimals = 1): { text: string; className: string } | null {
  if (a == null || b == null) return null
  const delta = a - b
  if (Math.abs(delta) < 0.05) return null
  return {
    text: `${delta > 0 ? '+' : ''}${formatNum(delta, decimals)}`,
    className: delta > 0 ? styles.deltaPos : styles.deltaNeg,
  }
}

export function ShotDetailPanel({
  primaryShot, compareShot, compareMode, onClose, onToggleCompare, onSwap,
}: Props) {
  const primaryLabel = `#${primaryShot.shot_number} ${primaryShot.club_name ?? primaryShot.club_type_raw}`
  const compareLabel = compareShot
    ? `#${compareShot.shot_number} ${compareShot.club_name ?? compareShot.club_type_raw}`
    : null

  return (
    <div className={styles.shotPanel}>
      <div className={styles.shotPanelHeader}>
        <div className={styles.shotPanelTitle}>
          <span style={{ color: primaryShot.club_color ?? 'var(--accent)' }}>{primaryLabel}</span>
          {compareShot && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> vs {compareLabel}</span>
          )}
        </div>
        <div className={styles.shotPanelActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCompare}
            title={compareMode ? 'Exit compare' : 'Compare shots'}
            style={compareMode ? { color: 'var(--accent)' } : undefined}
          >
            &#8644;
          </Button>
          {compareShot && (
            <Button variant="ghost" size="sm" onClick={onSwap} title="Swap shots">
              &#8645;
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} title="Close">
            &#10005;
          </Button>
        </div>
      </div>
      <div className={styles.shotPanelBody}>
        {PANEL_SECTIONS.map((section) => (
          <div key={section.title} className={styles.shotPanelSection}>
            <div className={styles.shotPanelSectionTitle}>{section.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {section.fields.map((field) => {
                  const pVal = getVal(primaryShot, field.key)
                  const cVal = compareShot ? getVal(compareShot, field.key) : null
                  const d = field.decimals ?? 1
                  const delta = compareShot ? fmtDelta(pVal, cVal, d) : null

                  // Skip field if no data for either shot
                  if (pVal == null && cVal == null) return null

                  return (
                    <tr key={field.key} className={styles.panelFieldRow}>
                      <td className={styles.panelFieldLabel}>{field.label}</td>
                      <td className={styles.panelFieldPrimary}>
                        {fmtVal(pVal, d)}
                        {field.unit && pVal != null && (
                          <span className={styles.panelFieldUnit}>{field.unit}</span>
                        )}
                      </td>
                      {compareShot && (
                        <Fragment>
                          <td className={styles.panelFieldCompare}>
                            {fmtVal(cVal, d)}
                          </td>
                          <td className={styles.panelFieldDelta}>
                            {delta && <span className={delta.className}>{delta.text}</span>}
                          </td>
                        </Fragment>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
