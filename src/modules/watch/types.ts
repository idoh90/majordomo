/**
 * A shift shape the user keeps on file. Not a booking — posting one is what
 * writes a CalendarEvent, and editing a shape never touches watches already
 * posted with it.
 */
export interface ShiftTemplate {
  id: string
  /** the user's own word for it. Record data: never routed through voice */
  name: string
  /** minutes since local midnight, 0…1439 */
  startMin: number
  /**
   * minutes since the SAME midnight, exclusive. Invariant:
   * startMin < endMin <= startMin + 1440. Above 1440 the watch ends on the
   * next calendar day — the minutes form of the old endHour-32 convention.
   */
  endMin: number
  createdAt: string
}
