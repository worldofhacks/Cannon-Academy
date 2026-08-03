/**
 * The onboarding script — every coach line, in one pure module.
 *
 * Board "Cannon Academy Onboarding" is twenty beats of one frame, and its `coach` map is the single
 * most load-bearing thing on it: the board's own reading audit says the instruction *"tap the green
 * cannon"* is exactly what the five-year-old who most needs it cannot read, and rule AUDIO makes
 * every line spoken. Copy that important does not belong inline in a JSX tree where nothing can
 * reach it — so it lives here, as data, and the screens are thin.
 *
 * **No React and no `react-native` import.** That is what lets the script be asserted headless by
 * vitest (RN's entry point is Flow-typed and the node runner cannot parse it), which is the same
 * constraint that shaped `flow.ts`, `player.ts` and `responsive.ts`.
 *
 * ## How twenty board beats become five real screens
 *
 * The board's twenty "screens" are states of one frame selected by `state.i`. They are NOT twenty
 * routes — `resolveDestination` already has exactly the five destinations they collapse onto, and
 * adding a sixth would cost a route file that `demo-navigation.test.ts` AC-1 pins:
 *
 *   beat 1        open                    → `Splash` + `launchGate`   (a restyle, not a new gate)
 *   beat 2        grade                   → `/onboarding`
 *   beats 3–4     name, flag              → two panels inside the ONE `/name-flag` route
 *   beats 5–16    the guided first duel   → `/guided-duel`
 *   beats 17–20   chart, dock, pills, done→ a coached overlay on the REAL `/chart`
 *
 * The last of those is the board's own `SHOW REAL` rule: *"Beats 17–19 spotlight the actual chart,
 * the actual dock, the actual header pills. Nothing is explained on an illustration a child will
 * never see again."*
 */
import { DEFAULT_CAPTAIN_NAME } from '../../stores/player';

/** One coach utterance: a headline every band can hear, and an optional quieter second line. */
export interface CoachLine {
  readonly line: string;
  /** The board's `coachSub`. Empty on the beats where the board leaves it empty. */
  readonly sub: string;
}

const say = (line: string, sub = ''): CoachLine => ({ line, sub });

// ── Beat 2 — the grade picker ────────────────────────────────────────────────────────────────

export const GRADE_COACH: CoachLine = say('Which ship looks like you?', 'A grown-up can help with this one.');

/**
 * The caregiver note, and the one place the board's copy is NOT adopted verbatim.
 *
 * The board says: *"this only picks where to start. It moves on its own as your captain gets
 * better."* The first clause is true of our engine and is adopted. The second is not, and shipping
 * it would be a product promise the code does not keep:
 *
 *   - `setGradeBand` is called from exactly one place, `commitGradeBand`, which is called from
 *     exactly one place, this picker. Nothing else in the app ever writes `gradeBand`.
 *   - The band is a hard CEILING, not a starting point that drifts: `maxGradeForBand` filters the
 *     reachable curriculum, and A-051 exists precisely to enforce that a K–1 captain is never
 *     shown multiplication *at all*. A band that self-adjusted would break that test by design.
 *
 * What DOES adapt within a band is unlock progression (`resolveUnlocks`) and rival accuracy — not
 * the band. So the honest line keeps the board's reassurance ("only picks where to start") and the
 * app's existing true guidance, and drops the claim we cannot keep.
 */
export const CAREGIVER_NOTE =
  'Grown-ups: this only picks where to start — pick the hardest one they can read.';

// ── Beat 3 — the name chips ──────────────────────────────────────────────────────────────────

/**
 * The board's eight. Short, phonetically simple, and gender-neutral — a child who cannot read is
 * picking the *shape* of a word, so four letters beats eight and no two of these share a first
 * letter with each other at a glance.
 */
export const NAME_CHIPS: readonly string[] = ['Wren', 'Bo', 'Tavi', 'Nim', 'Sable', 'Fig', 'Reef', 'Juno'];

export const NAME_COACH: CoachLine = say('Pick a name you like.');
export const FLAG_COACH: CoachLine = say('Now pick your flag.', 'This flies on your ship forever.');

// ── Beats 5–7 — the cast, introduced one at a time ───────────────────────────────────────────

/**
 * The board's `meetShip` / `meetCrew` / `meetRival`, which are the three beats with no lower panel
 * at all: rule NO DEAD SPACE says *"a panel that has nothing to say does not appear"*, so the stage
 * grows to fill the frame and one thing is spotlit.
 *
 * They run as a pre-roll over the first `select` phase rather than as extra engine phases. The
 * duel reducer has no concept of "look at this" and must not grow one — these are presentation.
 */
export interface CastBeat {
  readonly id: 'meetShip' | 'meetCrew' | 'meetRival';
  readonly coach: CoachLine;
  /** The board's `stageBadge`. */
  readonly badge: string;
  /** True where the board tints the badge purple for the rival. */
  readonly rival: boolean;
}

export const CAST_BEATS: readonly CastBeat[] = [
  { id: 'meetShip', coach: say('This is your ship.'), badge: 'YOUR SHIP', rival: false },
  { id: 'meetCrew', coach: say('And that is you, on the deck!'), badge: 'THAT IS YOU', rival: false },
  { id: 'meetRival', coach: say('Uh oh — a pirate!'), badge: 'A PIRATE!', rival: true },
];

// ── Beats 8–16 — the duel itself ─────────────────────────────────────────────────────────────

/** The presentation beats `guidedDuel.ts` projects. Structural, so this module imports nothing. */
export type GuidedPhase =
  | 'select'
  | 'question'
  | 'perfect'
  | 'fly'
  | 'impact'
  | 'miss'
  | 'timeout'
  | 'watch'
  | 'rivalFly'
  | 'rivalImpact'
  | 'victory'
  | 'defeat';

/**
 * The coach line for a live duel beat.
 *
 * `turn` and `damage` are read rather than assumed, which is the difference between transcribing
 * the board and shipping it. The board hardcodes "You broke three of their blocks!" because its
 * prototype has no engine; ours does, and `damageToEnemy` is the number actually applied. Saying
 * three when the hull moved by two is worse than saying nothing — the beat's entire job is teaching
 * a child to *count the blocks that vanished*.
 *
 * Likewise the board's beat 9 says "Two plus one. Tap the three" over a rigged two-tile grid. Our
 * question comes from the template pool with the engine's own choice count, so the line teaches the
 * same rule ("there is no clock") without naming an answer we did not generate.
 */
export function guidedCoach(input: {
  readonly phase: GuidedPhase;
  /** `view.turn` — the engine's volley number, 1-based. */
  readonly turn: number;
  /** Damage the last player volley did, when the phase is `impact`. */
  readonly damage: number;
  /** True once the victory chest has been opened, so beat 16 stops asking. */
  readonly chestOpen: boolean;
}): CoachLine {
  switch (input.phase) {
    // Beat 8. The board rings one cannon and dims the second; our guided loadout is one gun, so
    // the ring has nothing to compete with and the line is the same.
    case 'select':
      return say('Tap your cannon.', 'The glowing one.');

    // Beats 9 and 13. The first question a child ever answers gets the no-clock promise spoken out
    // loud — rule NO CLOCK: "the fear of a hidden timer is nearly as bad as a timer".
    case 'question':
      return input.turn <= 1
        ? say('Tap the answer.', 'There is no clock. Take all day.')
        : say('Your turn!', 'Pick any one. Try it.');

    case 'perfect':
      return say('Perfect shot!', 'Fast powder, true shot.');

    // Beat 10.
    case 'fly':
      return say('Boom! Watch it fly.');

    // Beat 11 — the counted blocks, from the engine's own damage.
    case 'impact':
      return input.damage > 0
        ? say(
            `You broke ${input.damage} of their blocks!`,
            'Count them — that is how hard you hit.',
          )
        : say('A hit!');

    // Beat 14, and the most important line in the flow. Rule SAFETY: a child who first meets a
    // wrong answer alone in duel four, with hull on the line, learns to fear the tiles.
    case 'miss':
      return say('Oops — that was the wrong one.', 'Nothing broke! Your ship is fine.');

    case 'timeout':
      return say('That one took a while.', 'Nothing broke. Slow is fine.');

    // Beat 12. The board removes the answer tiles entirely; absence is the lesson.
    case 'watch':
    case 'rivalFly':
      return say('Now they shoot. Just watch.', 'Hands off — nothing to tap.');

    case 'rivalImpact':
      return say('They hit your ship.', 'Planks, not people. The crew patches it.');

    // Beats 15 and 16.
    case 'victory':
      return input.chestOpen
        ? say('That is yours to keep!')
        : say('You won the duel!', 'A treasure chest! Tap it.');

    case 'defeat':
      return say('Back to port, Captain.', 'Your hull is patched already.');
  }
}

// ── Beats 17–20 — the chart walkthrough ──────────────────────────────────────────────────────

/**
 * Which control a chart beat rings, expressed as the hub-control id the chart already lays out.
 *
 * Naming the ids rather than coordinates is what keeps the overlay from re-deriving chart geometry:
 * `chartHubControlLayout` is already the one place that decides where these sit, and the chart
 * passes the very same array to its dock and header.
 */
export type ChartSpotlight = 'duel' | 'rank' | 'harbor';

export interface ChartBeat {
  readonly id: 'chart' | 'dock' | 'pills' | 'done';
  readonly coach: CoachLine;
  /** Hub controls ringed on this beat. Empty where the board rings nothing. */
  readonly spotlights: readonly ChartSpotlight[];
}

/**
 * The board's last four beats.
 *
 * Beat 18 rings **Fight only**, not all three, even though the line names three buttons — the board
 * sets `lit: dockLit` on the Fight button alone, and rule ONE THING is explicit that a child must
 * never have to work out which of several glowing things an instruction refers to.
 *
 * Beat 19 is the one beat that rings two, and deliberately: they are the two *nouns* ("your name",
 * "your coins") and the line names them in the order they are read, left then right.
 */
export const CHART_BEATS: readonly ChartBeat[] = [
  { id: 'chart', coach: say('This is the sea. You are here.'), spotlights: [] },
  { id: 'dock', coach: say('Three buttons. Fight is the big one.'), spotlights: ['duel'] },
  {
    id: 'pills',
    coach: say('Your name up here. Your coins here.', 'Tap them any time.'),
    spotlights: ['rank', 'harbor'],
  },
  { id: 'done', coach: say('Ready to sail!'), spotlights: [] },
];

/**
 * Has this captain actually chosen a name, or are they sailing under the default?
 *
 * **"Captain" is a salutation the app says beside the name, and it is also the name the store
 * substitutes for anyone who skips the name screen.** Every place that says the salutation has to
 * know the difference or it says the word twice.
 *
 * Checking only for an empty string is not enough, and is very nearly dead code: `setNameAndFlag`
 * defaults at COMMIT time, so a skipping captain is stored with the literal name `'Captain'` and
 * never with `''`. That miss shipped "Ready, Captain Captain!" on the send-off and "Captain Captain"
 * in the name screen's echo banner — two sites, one cause, which is why the predicate lives here
 * once instead of being re-derived at each call site.
 *
 * Case-insensitive because the rename sheet lets an adult type the word themselves.
 */
export function isUnnamedCaptain(captainName: string): boolean {
  const trimmed = captainName.trim();
  return trimmed === '' || trimmed.toLowerCase() === DEFAULT_CAPTAIN_NAME.toLowerCase();
}

/** The board's beat-20 headline, with the child's own name in it — and "Captain" said once. */
export function readyHeadline(captainName: string): string {
  return isUnnamedCaptain(captainName)
    ? 'Ready, Captain!'
    : `Ready, Captain ${captainName.trim()}!`;
}

/**
 * Clamps a persisted beat index back into range.
 *
 * `Captain.onboardingBeat` is tolerated-as-absent (see `persistence.ts`), so it can arrive as
 * `undefined` from any save written before this shipped, and as anything at all from a corrupted
 * one — storage is untrusted input. A walkthrough that opened on beat 9 of a 4-beat list would
 * render nothing and strand the captain behind an invisible overlay.
 */
export function clampChartBeat(stored: number | undefined): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return 0;
  const index = Math.floor(stored);
  if (index < 0) return 0;
  return Math.min(index, CHART_BEATS.length - 1);
}
