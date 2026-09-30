import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight, Briefcase, Building, Building2, Car, Clapperboard, Coins, Ellipsis, Gift, GraduationCap, HandCoins, House, KeyRound,
  Landmark, Laptop, LifeBuoy, Lightbulb, Palmtree, PiggyBank, Plane, Plus, ReceiptText, RefreshCw, Repeat, Scissors, Shield,
  ShoppingBag, ShoppingCart, Stethoscope, TrainFront, TrendingUp, Undo2, UtensilsCrossed,
} from 'lucide-react'
import { ADJUSTMENT_CATEGORY, TRANSFER_CATEGORY } from '../lib/meta'
import type { Goal } from '../lib/types'

/* One drawn icon family for categories and goals, instead of emoji — emoji render differently
   on every platform and read as casual. Custom categories get a serif monogram. */

type Icon = LucideIcon

const CATEGORY_ICONS: Record<string, Icon> = {
  Housing: House, 'Bills & utilities': Lightbulb, Groceries: ShoppingCart, Transport: TrainFront, Dining: UtensilsCrossed,
  Entertainment: Clapperboard, Shopping: ShoppingBag, Travel: Plane, Subscriptions: Repeat, Health: Stethoscope,
  Education: GraduationCap, Insurance: Shield, 'Debt repayment': ReceiptText, 'Gifts & giving': Gift, 'Fees & interest': Landmark,
  Other: Ellipsis,
  Salary: Briefcase, Freelance: Laptop, 'Business income': Building2, Dividends: TrendingUp, Interest: Coins,
  'Rental income': KeyRound, 'Government payments': Building, Refund: Undo2, 'Gift received': HandCoins, 'Other income': Plus,
  [TRANSFER_CATEGORY]: ArrowLeftRight, [ADJUSTMENT_CATEGORY]: RefreshCw,
}

function Monogram({ text, size }: { text: string; size: number }) {
  const letter = (text.trim()[0] ?? '•').toUpperCase()
  return <span className="monogram" style={{ fontSize: Math.round(size * 0.95), width: size, height: size }} aria-hidden>{letter}</span>
}

export function CatGlyph({ name, size = 16 }: { name: string; size?: number }) {
  const I = CATEGORY_ICONS[name]
  return I ? <I size={size} strokeWidth={1.6} aria-hidden /> : <Monogram text={name} size={size} />
}

/** Category name with its icon, for lists and tables. */
export function CatLabel({ name }: { name: string }) {
  return <span className="cat-label"><span className="cat-glyph"><CatGlyph name={name} size={14} /></span>{name}</span>
}

const GOAL_BY_EMOJI: Record<string, Icon> = { '🛟': LifeBuoy, '🏡': House, '🏠': House, '🏝️': Palmtree, '✈️': Plane, '🚗': Car, '📈': TrendingUp, '✂️': Scissors, '💰': PiggyBank, '🎓': GraduationCap, '💍': Gift }
const GOAL_BY_WORD: [RegExp, Icon][] = [
  [/emergenc|rainy|safety|buffer/i, LifeBuoy], [/house|home|deposit|flat|mortgage/i, House], [/holiday|trip|travel|japan|vacation/i, Palmtree],
  [/car|vehicle/i, Car], [/invest|portfolio|isa/i, TrendingUp], [/debt|loan|card|pay off/i, Scissors], [/wedding|ring|gift/i, Gift],
  [/school|uni|course|education/i, GraduationCap],
]

export function goalIcon(g: Pick<Goal, 'name' | 'emoji'>): Icon {
  return GOAL_BY_EMOJI[g.emoji] ?? GOAL_BY_WORD.find(([re]) => re.test(g.name))?.[1] ?? PiggyBank
}

export function GoalGlyph({ goal, size = 18 }: { goal: Pick<Goal, 'name' | 'emoji'>; size?: number }) {
  const I = goalIcon(goal)
  return <I size={size} strokeWidth={1.5} aria-hidden />
}
