import type { RangeShotResponse } from '../../api'
import { formatNum, formatDateTime } from '../../utils/format'
import styles from './ShotDetailPanel.module.css'

interface Props {
  primaryShot: RangeShotResponse
  compareShot: RangeShotResponse | null
  sessionDate?: string | null
  compareSessionDate?: string | null
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
    title: 'Spin',
    fields: [
      { label: 'Rate', key: 'spin_rate_rpm', unit: 'rpm', decimals: 0 },
      { label: 'Axis', key: 'spin_axis_deg', unit: '\u00b0' },
      { label: 'Launch', key: 'launch_angle_deg', unit: '\u00b0' },
      { label: 'Launch Dir', key: 'launch_direction_deg', unit: '\u00b0' },
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
]

function formatSource(source: string): string {
  const map: Record<string, string> = {
    trackman: 'Trackman',
    rapsodo: 'Rapsodo',
    garmin: 'Garmin',
  }
  return map[source] ?? source
}

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

export function ShotDetailPanel({ primaryShot, compareShot, sessionDate, compareSessionDate }: Props) {
  const isCompare = !!compareShot

  return (
    <div className={styles.body}>
      {/* Compare legend */}
      {isCompare && (
        <div className={styles.compareHeader}>
          <span className={styles.primaryVal}>
            Shot {primaryShot.shot_number} &mdash; {primaryShot.club_name ?? primaryShot.club_type_raw}
          </span>
          <span className={styles.secondaryVal}>
            Shot {compareShot.shot_number} &mdash; {compareShot.club_name ?? compareShot.club_type_raw}
          </span>
        </div>
      )}

      {/* Source section */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Source</div>
        <div className={styles.fieldGrid}>
          <div className={styles.fieldItem}>
            <span className={styles.fieldLabel}>Device</span>
            <span className={styles.fieldValue}>
              {isCompare ? (
                <span className={styles.compareVals}>
                  <span className={styles.primaryVal}>{formatSource(primaryShot.source)}</span>
                  <span className={styles.secondaryVal}>{formatSource(compareShot.source)}</span>
                </span>
              ) : (
                formatSource(primaryShot.source)
              )}
            </span>
          </div>
          <div className={styles.fieldItem}>
            <span className={styles.fieldLabel}>Session</span>
            <span className={styles.fieldValue}>
              {isCompare ? (
                <span className={styles.compareVals}>
                  <span className={styles.primaryVal}>
                    {sessionDate ? formatDateTime(sessionDate) : '\u2014'}
                  </span>
                  <span className={styles.secondaryVal}>
                    {compareSessionDate ? formatDateTime(compareSessionDate) : '\u2014'}
                  </span>
                </span>
              ) : (
                sessionDate ? formatDateTime(sessionDate) : '\u2014'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Data sections */}
      {PANEL_SECTIONS.map((section) => (
        <div key={section.title} className={styles.section}>
          <div className={styles.sectionTitle}>{section.title}</div>
          <div className={styles.fieldGrid}>
            {section.fields.map((field) => {
              const pVal = getVal(primaryShot, field.key)
              const cVal = isCompare ? getVal(compareShot, field.key) : null
              const d = field.decimals ?? 1
              const delta = isCompare ? fmtDelta(pVal, cVal, d) : null

              if (pVal == null && cVal == null) return null

              return (
                <div key={field.key} className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>{field.label}</span>
                  {!isCompare ? (
                    <span className={styles.fieldValue}>
                      {fmtVal(pVal, d)}
                      {field.unit && pVal != null && (
                        <span className={styles.fieldUnit}>{field.unit}</span>
                      )}
                    </span>
                  ) : (
                    <span className={styles.compareVals}>
                      <span className={styles.primaryVal}>{fmtVal(pVal, d)}</span>
                      <span className={styles.secondaryVal}>{fmtVal(cVal, d)}</span>
                      {delta && (
                        <span className={`${styles.deltaVal} ${delta.className}`}>
                          {delta.text}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
