import type { HouseModel, WingId } from './house'
import { HouseCard, PatternCard, SignalCard } from './HouseCards'
import { useHouse } from './useHouse'

/**
 * THE HOUSE — a standing rail on every wing, in one fixed order: what this
 * wing is doing, what the others are doing, and the one place they are
 * treading on each other.
 *
 * Rendered twice with the same cards: as a sticky 252px column at xl, and as
 * part of the stacked flow below that. It lives in the shell rather than in
 * any wing because only src/app may read every wing's store — the wings are
 * forbidden from importing one another, which is exactly the point.
 */
export function House({ wing, screen }: { wing: WingId; screen: React.ReactNode }) {
  // computed ONCE and handed to both surfaces: only one of them is ever
  // visible, but both mount, and computeHouse walks eight weeks of events for
  // two wings plus the whole workout history through the strain model
  const house = useHouse()
  return (
    <>
      {/* min-w-0 on the screen column is load-bearing: without it a wing that
          contains its own horizontal scroller sets the flex minimum and shoves
          the rail off the page */}
      <div className="xl:flex xl:items-start xl:gap-4">
        <div className="min-w-0 flex-1">{screen}</div>
        <Rail house={house} wing={wing} />
      </div>
      <Stack house={house} wing={wing} />
    </>
  )
}

function Rail({ house, wing }: { house: HouseModel; wing: WingId }) {
  return (
    <aside className="sticky top-4 hidden w-[252px] flex-none flex-col gap-4 xl:flex">
      <SignalCard house={house} wing={wing} />
      <HouseCard house={house} exclude={wing} />
      <PatternCard house={house} />
    </aside>
  )
}

/** the same three cards, folded into the page below xl */
function Stack({ house, wing }: { house: HouseModel; wing: WingId }) {
  return (
    <div className="mt-4 flex flex-col gap-4 xl:hidden">
      <SignalCard house={house} wing={wing} />
      <HouseCard house={house} exclude={wing} />
      <PatternCard house={house} />
    </div>
  )
}
