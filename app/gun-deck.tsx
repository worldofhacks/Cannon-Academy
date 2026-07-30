import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CannonId, GradeBand } from '@content/schemas';
import { TRAY_CAPACITY } from '@engine/tuning';
import { maxGradeForBand } from '@engine/placement';

import { TemperBadge } from '../src/components/duel/TemperBadge';
import { ResponsiveFrame, useResponsiveSurface } from '../src/components/ResponsiveFrame';
import { cannonIdentityPresentation } from '../src/services/cannonDifficulty';
import { resolveDestination } from '../src/services/flow';
import {
  commitLoadout,
  deckDraft,
  deckSlots,
  displaceCannon,
  selectCannon,
  type CommitResult,
  type DeckSlot,
  type SelectResult,
} from '../src/services/loadout';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import {
  cannonLook,
  cannonNotYetLabel,
  CANNON_NOT_YET_CHIP,
  CANNON_NOT_YET_MESSAGE,
  DAMAGE_BAND_SCALE,
  temperLook,
} from '../src/theme/cannonPresentation';
import { color, MIN_TAP_TARGET, radius, type } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * The gun deck — which cannons sail with you.
 *
 * Transcribed from the board labelled `Gun deck` in `Cannon Academy Design Boards.dc.html`, read
 * as the renderer resolved it, so the numbers here are measured rather than chosen: a 112pt slot,
 * a 104pt hold card, a 4pt hard bottom edge, `rgb(12, 94, 134)` behind the title.
 *
 * The board's two zones are the whole idea, and they are what makes AC-1 legible to a five-year-old
 * without a word of explanation: **On the deck** holds the guns that sail, **In the hold** holds
 * the ones that do not. Together they show every owned cannon; a gun is in exactly one of them, so
 * "which three sail" is a question about where a card is sitting rather than about a checkbox.
 *
 * Every selection rule lives in `services/loadout.ts` and the slot count comes from the engine's
 * `TRAY_CAPACITY`. Nothing here re-decides either — a literal slot count on this screen is the bug
 * the ticket's DoD-3 exists to prevent, and a "helpfully" truncating tap is the bug AC-2 exists to
 * prevent.
 *
 * ## A third state: owned, and not yet
 *
 * A-058 put the curriculum ceiling on the duel and left one seam here. A K-1 captain can win the
 * chest-only `nine_pounder` (skill `place_value_compare`, grade 2), own it, and slot it — the only
 * gate `commitLoadout` applies is ownership — and the duel then refuses to arm it. The deck said
 * "3 OF 3 SLOTS" while the tray showed two guns, and one of the child's three chosen guns did not
 * exist in the fight.
 *
 * So the two zones become two-and-a-half: a gun that is owned but above the band is **shown**, in
 * the hold, marked `NOT YET`, and is **not tappable and not countable**. Shown because the child
 * earned it from a chest and this is the one screen where rewards live — the same call the sea
 * chart makes for a fogged island and the Harbor makes for an unaffordable ship. Not countable
 * because the slot count is a promise about the duel, and `deckDraft` applies the identical rule
 * the duel does (`inBandLoadout`), so the count the deck reports is the count the duel will honour.
 *
 * Not tappable rather than tappable-and-refusing: `select` has no other exit, so a tile that eats a
 * tap is the A-047 failure one screen over. The card carries its own answer instead, so there is
 * nothing to discover by pressing it.
 */

/**
 * Colours measured off the board that `theme/tokens.ts` does not name yet. Transcribed as the
 * renderer resolved them — `rgb(12, 94, 134)`, not "a dark sea blue". They belong in tokens under
 * semantic names; that file is outside this ticket's scope, so they sit here carrying their
 * provenance rather than being quietly approximated by the nearest token that already exists.
 *
 * The two parchment shades are already spelled the same way in `components/duel/CannonTray.tsx`,
 * so this is the established call-site pattern rather than a new one.
 */
const board = {
  /** Status bar and title bar. */
  headerBg: '#0C5E86',
  /** The back control's tile — one step darker than the bar it sits on. */
  headerTile: '#0A4E70',
  /** Sunken parchment: the slot-count chip, the glyph tiles, an empty slot. */
  parchmentSunken: '#F0E2C8',
  /** The damage band's unfilled track. */
  bandTrack: '#E8DCC4',
  /** The NEW chip's drop edge — `success`, darkened. */
  newChipEdge: '#1E7F41',
} as const;

/**
 * The operator chips in the title bar. The board draws three, lit for the operations the captain
 * owns a gun for and dulled for the rest; the catalog has more glyphs than the board's fixture, so
 * the row is the arithmetic operations rather than every glyph in the catalog — seven 22pt chips do
 * not fit beside the title at the 360pt floor.
 *
 * **Gated by grade band (A-051).** This used to be a flat `['+', '−', '×', '÷']`, so a
 * kindergartner who picked K–1 saw `×` and `÷` sitting dulled on their own gun deck — two
 * operations they will not meet for three years, displayed as things they have not earned yet. The
 * band already gates everything else that could surface them: `range.ts` refuses a drill above the
 * band, `rankView` filters its skill rows, and `resolveUnlocks` will not open an island whose range
 * teaches nothing age-appropriate. This row was the one place the ceiling leaked.
 *
 * Each operation is mapped to the lowest `minGrade` among the catalog skills that use it, so the
 * chip appears exactly when the curriculum does.
 */
const OPERATION_MIN_GRADE: readonly { readonly glyph: string; readonly minGrade: number }[] = [
  { glyph: '+', minGrade: 0 },
  { glyph: '−', minGrade: 1 },
  { glyph: '×', minGrade: 3 },
  { glyph: '÷', minGrade: 3 },
];

/**
 * `←` and `↑` carry emoji presentation on iOS and would ignore the `color` prop, rendering as blue
 * system arrows on a parchment bar. U+FE0E pins them to text presentation.
 */
const ARROW_BACK = '←︎';
const ARROW_UP = '↑︎';

type Refusal = Extract<CommitResult, { ok: false }>['refusal'];

/** A refusal a child can act on. Every branch names the way out, never just the "no". */
function refusalText(refusal: Refusal): string {
  switch (refusal.reason) {
    case 'empty':
      return 'Put at least one cannon on the deck before you sail.';
    case 'over-capacity':
      return `Only ${TRAY_CAPACITY} cannons can sail at once.`;
    case 'duplicate':
      return 'That gun is already on the deck.';
    case 'not-owned':
      return 'You have not earned that gun yet.';
  }
}

export default function GunDeck() {
  return (
    <ResponsiveFrame surface="reading">
      <GunDeckBody />
    </ResponsiveFrame>
  );
}

function GunDeckBody() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { contentWidth } = useResponsiveSurface();
  const tx = L.t;
  const ax = L.a;

  const captain = useCaptain((s) => s.captain);

  /**
   * The band used for LABELS only — difficulty wording and the operator row.
   *
   * `difficultyPresentation` needs a band to phrase "just right" against, and `null` is not one, so
   * this coerces to the narrowest band rather than the widest: a bandless captain sees the fewest
   * operators and the most conservative wording, never the most.
   *
   * The CEILING does not read this. It reads `captain.gradeBand` raw, through `deckDraft` and
   * `slot.sails`, because it has to be byte-for-byte the rule the duel applies — and A-058's rule
   * is that a missing band fails CLOSED. Coercing to `k_1` here would let the deck offer a
   * bandless captain two guns the duel would then arm nothing with. See `gun-deck.test.ts`.
   */
  const labelBand: GradeBand = captain.gradeBand ?? 'k_1';

  /**
   * Narrowed by `deckDraft` to what is owned AND can sail, so the draft and the rendered deck
   * cannot disagree, and the deck's slot count cannot over-promise the duel's tray.
   *
   * The owned half: the deck is drawn from `deckSlots`, which only ever emits owned cannons, while
   * `selectCannon` counts the draft. A save carrying a gun that was never earned would otherwise
   * show two slots full and refuse the fourth tap as if three were. `commitLoadout` still refuses
   * `not-owned` — that guarantee belongs to the service and stays there; this keeps it unreachable.
   *
   * The band half: a save can legitimately arrive carrying an over-grade chest gun, because that is
   * exactly the state this screen used to be able to write. Dropping it from the DRAFT (never from
   * the deck) means opening and leaving the gun deck heals such a save — the gun keeps its row and
   * its ownership, and `equippedCannons` comes back agreeing with what the duel will arm.
   */
  const [draft, setDraft] = useState<readonly CannonId[]>(() => deckDraft(captain));
  const [pending, setPending] = useState<Extract<SelectResult, { kind: 'full' }> | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const slots = useMemo(() => deckSlots(captain, draft), [captain, draft]);
  const byId = useMemo(() => new Map(slots.map((s) => [s.cannon.id, s])), [slots]);

  /**
   * The deck, in the order the player chose it — NOT catalog order. `commitLoadout` persists that
   * order and only the duel tray re-sorts (`trayCannons`), which is the deliberate opposition
   * between this ticket's AC-3 and T-030's AC-2. A deck that re-sorted itself under a child's
   * finger is a deck they have to re-read after every tap.
   */
  const onDeck = useMemo(
    () => draft.map((id) => byId.get(id)).filter((s): s is DeckSlot => s !== undefined),
    [draft, byId],
  );
  const inHold = useMemo(() => slots.filter((s) => !s.equipped), [slots]);

  const emptySlots = Math.max(0, TRAY_CAPACITY - onDeck.length);
  const newCount = inHold.filter((s) => s.isNew).length;

  /**
   * Only the operations this band will ever be asked. A K-1 deck shows `+` and `−`; multiplication
   * and division appear at grade 3, which is where the catalog puts them (A-051).
   */
  const operations = useMemo(() => {
    const maxGrade = maxGradeForBand(labelBand);
    return OPERATION_MIN_GRADE.filter((op) => op.minGrade <= maxGrade).map((op) => op.glyph);
  }, [labelBand]);

  const ownedGlyphs = useMemo(
    () => new Set(captain.ownedCannons.map((id) => cannonLook[id].glyph)),
    [captain.ownedCannons],
  );

  /** Tapping a gun in the hold tries to put it on the deck. A full deck REFUSES and says so. */
  const tapHold = (id: CannonId) => {
    // A not-yet gun renders as a plain card with no press handler, so this is belt and braces —
    // but it is the draft's own invariant (never anything the duel would refuse) stated once, in
    // the one function that can add to it, rather than resting on a JSX branch staying correct.
    if (byId.get(id)?.sails === false) return;
    setRefusal(null);
    const result = selectCannon(draft, id);
    if (result.kind === 'full') {
      // Not a silent truncation: the incoming gun waits, named, until the child says what leaves.
      setPending(result);
      return;
    }
    setPending(null);
    setDraft(result.selection);
  };

  /** Tapping a gun on the deck either completes a swap or sends that gun back to the hold. */
  const tapDeck = (id: CannonId) => {
    setRefusal(null);
    if (pending !== null) {
      setDraft(displaceCannon(draft, id, pending.incoming));
      setPending(null);
      return;
    }
    const result = selectCannon(draft, id);
    if (result.kind !== 'full') setDraft(result.selection);
  };

  /**
   * Leaving IS committing — the board gives this screen one exit and no separate confirm button.
   * A refused commit does not navigate, which is what keeps AC-4 from being a dead end: the child
   * stays on the deck with the message rather than landing on a duel with no gun on it.
   *
   * Marking seen happens HERE, on the way out, and deliberately not on the way in. Marking on open
   * is self-erasing in two different ways: `markCannonsSeen` re-renders this screen, and — the one
   * that actually shipped — the screen re-mounts (StrictMode in development, a router redirect in
   * production), so a "capture the badge before marking" guard reads a store that the *previous*
   * mount already marked. The badge then never renders at all, while every unit test still passes,
   * because the suite exercises `deckSlots` and `markCannonsSeen` and cannot see a mount cycle.
   * Marking on exit is remount-proof and it is also the truer reading of AC-5: seen means a child
   * looked at the deck and left it, not that a component happened to mount.
   */
  const leave = () => {
    const result = commitLoadout(captain, draft);
    if (!result.ok) {
      setPending(null);
      setRefusal(refusalText(result.refusal));
      return;
    }
    const store = captainStore.getState();
    store.equipCannons(result.loadout);
    store.markCannonsSeen(store.captain.ownedCannons);
    router.replace(`/${resolveDestination(captainStore.getState().captain)}`);
  };

  const hint =
    refusal ??
    (pending !== null
      ? `Deck full — tap a cannon above to swap it for the ${byId.get(pending.incoming)?.cannon.displayName ?? 'new gun'}.`
      : 'Tap a cannon below, then tap a slot to put it there.');

  // The board's back control is 44pt square. That is below this project's 64pt tap floor, so the
  // PAINT stays at the board's size and the TARGET is grown with hitSlop — fidelity and small
  // hands, rather than one at the cost of the other.
  const backSize = tx(44);
  const backSlop = Math.max(0, Math.round((MIN_TAP_TARGET - backSize) / 2));

  const gridGap = tx(10);
  const cardWidth = (contentWidth - gridGap) / 2;

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top, paddingHorizontal: L.gutter }]}>
        <View style={[s.headerRow, { paddingVertical: tx(8), gap: tx(10) }]}>
          <Pressable
            onPress={leave}
            hitSlop={backSlop}
            accessibilityRole="button"
            accessibilityLabel="Done. Sail with these cannons"
            style={({ pressed }) => [
              s.backTile,
              { width: backSize, height: backSize, borderRadius: tx(radius.cardInner) },
              pressed && s.pressedDim,
            ]}
          >
            <Text style={[s.backGlyph, { fontSize: tx(20) }]}>{ARROW_BACK}</Text>
          </Pressable>

          <Text style={[s.headerTitle, { fontSize: tx(20), lineHeight: tx(26) }]} numberOfLines={1}>
            Your gun deck
          </Text>

          <View style={[s.opRow, { gap: ax(3) }]}>
            {operations.map((glyph) => {
              const owned = ownedGlyphs.has(glyph);
              return (
                <View
                  key={glyph}
                  style={[
                    s.opChip,
                    owned ? s.opChipOwned : s.opChipDull,
                    { width: ax(22), height: ax(22), borderRadius: ax(radius.nub) },
                  ]}
                >
                  <Text style={[s.opGlyph, owned ? s.opGlyphOwned : s.opGlyphDull, { fontSize: ax(12) }]}>
                    {glyph}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View
        style={[
          s.body,
          {
            paddingHorizontal: L.gutter,
            paddingTop: tx(12),
            paddingBottom: insets.bottom + tx(12),
            gap: tx(10),
          },
        ]}
      >
        <View style={[s.sectionRow, { gap: tx(8) }]}>
          <Text style={[s.sectionTitle, { fontSize: tx(16) }]}>On the deck</Text>
          <View style={[s.countChip, { paddingVertical: tx(2), paddingHorizontal: tx(8) }]}>
            <Text style={s.countChipText}>
              {onDeck.length} OF {TRAY_CAPACITY} SLOTS
            </Text>
          </View>
        </View>

        <View style={[s.slotRow, { gap: tx(10) }]}>
          {onDeck.map((slot) => {
            const look = cannonLook[slot.cannon.id];
            return (
              <Pressable
                key={slot.cannon.id}
                onPress={() => tapDeck(slot.cannon.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: true }}
                accessibilityLabel={
                  pending !== null
                    ? `Swap out ${slot.cannon.displayName}`
                    : `${slot.cannon.displayName}, sailing. Send back to the hold`
                }
                style={({ pressed }) => [
                  s.slot,
                  { height: tx(112), borderRadius: tx(radius.card), gap: tx(4) },
                  // While a gun waits to come aboard, the slots are the only live targets. The
                  // board has one static frame and cannot show this state; AC-2 requires it.
                  pending !== null && s.slotAwaitingSwap,
                  pressed && s.pressedDrop,
                ]}
              >
                <Text style={[s.slotGlyph, { fontSize: tx(34), lineHeight: tx(42) }]}>{look.glyph}</Text>
                <Text style={[s.slotRange, { fontSize: tx(10) }]}>{look.range}</Text>
                <TemperBadge temper={slot.cannon.temperament} size={ax(26)} />
              </Pressable>
            );
          })}

          {Array.from({ length: emptySlots }, (_, i) => (
            <View
              key={`empty-${i}`}
              accessibilityLabel="Empty slot"
              style={[s.slotEmpty, { height: tx(112), borderRadius: tx(radius.card), gap: tx(4) }]}
            >
              <Text style={[s.emptyPlus, { fontSize: tx(30), lineHeight: tx(34) }]}>+</Text>
              <Text style={[s.emptyLabel, { fontSize: tx(11) }]}>EMPTY</Text>
            </View>
          ))}
        </View>

        <View
          style={[
            s.hint,
            {
              paddingVertical: tx(9),
              paddingHorizontal: tx(11),
              borderRadius: tx(radius.cardInner),
              gap: tx(8),
            },
          ]}
        >
          <View style={[s.hintIcon, { width: ax(26), height: ax(26), borderRadius: ax(8) }]}>
            <Text style={[s.hintIconGlyph, { fontSize: ax(15) }]}>{refusal === null ? ARROW_UP : '!'}</Text>
          </View>
          <Text style={[s.hintText, { fontSize: tx(12), lineHeight: tx(17) }]}>{hint}</Text>
        </View>

        <View style={[s.sectionRow, { gap: tx(8) }]}>
          <Text style={[s.sectionTitle, { fontSize: tx(16) }]}>In the hold</Text>
          <View style={{ flex: 1 }} />
          {newCount > 0 ? (
            <View style={[s.newCountChip, { paddingVertical: tx(2), paddingHorizontal: tx(8) }]}>
              <Text style={s.newCountChipText}>{newCount} NEW</Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={s.holdScroll}
          contentContainerStyle={[s.holdGrid, { gap: gridGap, paddingTop: tx(6), paddingBottom: tx(10) }]}
          showsVerticalScrollIndicator={false}
        >
          {inHold.map((slot) => (
            <HoldCard
              key={slot.cannon.id}
              slot={slot}
              gradeBand={labelBand}
              isNew={slot.isNew}
              width={cardWidth}
              tx={tx}
              ax={ax}
              onPress={() => tapHold(slot.cannon.id)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

interface HoldCardProps {
  readonly slot: DeckSlot;
  readonly gradeBand: GradeBand;
  readonly isNew: boolean;
  readonly width: number;
  readonly tx: (n: number) => number;
  readonly ax: (n: number) => number;
  readonly onPress: () => void;
}

/**
 * One gun in the hold. The band meter is the reason this is a card and not a list row: a fixed
 * 0–40 ruler lets a child compare two guns by where the bar sits rather than by reading two
 * numbers, which is the trade a volatile cannon is asking them to make.
 *
 * Two states, and `slot.sails` picks between them. A gun the band cannot fire yet keeps its glyph,
 * its name and — most of all — its SKILL NAME, because what it teaches is the entire content of
 * looking forward to it. What it loses is the stats row (damage and fuse are a trade you cannot
 * make on a gun that cannot fire), its temperament colour, and its press handler.
 *
 * The two card grounds are `white` and the board's sunken parchment, and every text colour on this
 * card clears AA on BOTH — `inkDark` measures 15.02 and 11.74, `inkDarkMuted` 6.23 and 4.87 — which
 * is why the not-yet state needs no second set of text tokens (A-054's rule: certify the pair, not
 * the colour).
 */
function HoldCard({ slot, gradeBand, isNew, width, tx, ax, onPress }: HoldCardProps) {
  const { cannon, sails } = slot;
  const look = cannonLook[cannon.id];
  const temper = temperLook[cannon.temperament];
  const identity = cannonIdentityPresentation({ cannon, gradeBand });
  const left = (cannon.damageMin / DAMAGE_BAND_SCALE) * 100;
  const span = ((cannon.damageMax - cannon.damageMin) / DAMAGE_BAND_SCALE) * 100;

  const frame = {
    width,
    height: tx(104),
    borderRadius: tx(radius.card),
    padding: tx(9),
    gap: tx(5),
    // A not-yet gun that just arrived from a chest is BOTH new and waiting; the badge stays,
    // because "a thing arrived" is the true half a child most needs to see.
    borderBottomColor: isNew ? color.success : color.parchmentEdge,
  } as const;

  const body = (
    <>
      <View style={[s.holdHead, { gap: tx(7) }]}>
        <View
          style={[
            s.holdTile,
            // The tile's own fill IS sunken parchment, so on a sunken card it would vanish; one
            // step darker keeps the glyph sitting on something.
            !sails && s.holdTileNotYet,
            { width: ax(38), height: ax(38), borderRadius: ax(radius.tile) },
          ]}
        >
          <Text style={[s.holdTileGlyph, { fontSize: ax(21) }]}>{look.glyph}</Text>
        </View>

        <View style={s.holdNameCol}>
          <Text style={[s.holdName, { fontSize: tx(13) }]} numberOfLines={1}>
            {cannon.displayName}
          </Text>
          <Text style={[s.holdRange, { fontSize: tx(10) }]}>{look.range}</Text>
          <Text style={[s.holdSkill, { fontSize: tx(9) }]} numberOfLines={1}>
            {identity.skillName}
          </Text>
        </View>

        <TemperBadge temper={cannon.temperament} size={ax(24)} />
      </View>

      <View style={[s.bandTrack, { height: ax(12), borderRadius: ax(6) }]}>
        <View
          style={[
            s.bandFill,
            {
              left: `${left}%`,
              width: `${span}%`,
              borderRadius: ax(6),
              // Drained of its temperament colour. The bar still shows the gun's reach — that is
              // the anticipation — but the colour is a cue about firing, and this one cannot fire.
              backgroundColor: sails ? temper.color : color.inkDarkMuted,
            },
          ]}
        />
      </View>

      {sails ? (
        <View style={[s.holdMeta, { gap: tx(5) }]}>
          <Text style={[s.holdDifficulty, { fontSize: tx(9) }]}>{identity.difficultyLabel}</Text>
          <Text style={[s.holdFuse, { fontSize: tx(9) }]}>{identity.fuseLabel}</Text>
          <Text style={[s.holdDamage, { fontSize: tx(13) }]}>
            {cannon.damageMin}–{cannon.damageMax}
          </Text>
          <Text style={[s.holdTemper, { fontSize: tx(10) }]}>{identity.temperamentWord}</Text>
          {identity.weaponChipLabel !== null ? (
            <Text style={[s.holdWeapon, { fontSize: tx(9) }]}>{identity.weaponChipLabel}</Text>
          ) : null}
        </View>
      ) : (
        <View style={[s.holdMeta, { gap: tx(4) }]}>
          <View style={[s.notYetChip, { paddingVertical: tx(2), paddingHorizontal: tx(7) }]}>
            <Text style={s.notYetChipText}>{CANNON_NOT_YET_CHIP}</Text>
          </View>
          {/* Its own line, always — the card is half a phone wide and this sentence is the point. */}
          <Text
            style={[s.notYetMessage, { fontSize: tx(10), lineHeight: tx(13) }]}
            numberOfLines={2}
          >
            {CANNON_NOT_YET_MESSAGE}
          </Text>
        </View>
      )}

      {isNew ? (
        <View style={[s.newChip, { paddingVertical: tx(3), paddingHorizontal: tx(9) }]}>
          <Text style={s.newChipText}>NEW</Text>
        </View>
      ) : null}
    </>
  );

  // Not a disabled Pressable: a control that announces itself as a button and then does nothing is
  // the A-047 dead tile, and `select` is a phase with no other exit. The card carries its own
  // answer, so there is nothing a press could reveal.
  if (!sails) {
    return (
      <View
        accessible
        accessibilityLabel={`${cannonNotYetLabel(cannon.displayName, identity.skillName)}${
          isNew ? ' New.' : ''
        }`}
        style={[s.holdCard, s.holdCardNotYet, frame]}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: false }}
      accessibilityLabel={`${identity.accessibilityDescription}${isNew ? ', new' : ''}. Put on the deck`}
      style={({ pressed }) => [s.holdCard, frame, pressed && s.pressedDrop]}
    >
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.parchment },

  // The bar runs under the status bar too — the board fills that 20pt strip with the same colour.
  header: { backgroundColor: board.headerBg },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backTile: {
    backgroundColor: board.headerTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { ...type.subtitle, color: color.chipInk },
  headerTitle: { ...type.display, flex: 1, color: color.parchment },

  opRow: { flexDirection: 'row', alignItems: 'center' },
  opChip: { alignItems: 'center', justifyContent: 'center' },
  opChipOwned: { backgroundColor: color.amber },
  opChipDull: { backgroundColor: color.parchmentEdge },
  opGlyph: { ...type.subtitle, includeFontPadding: false },
  opGlyphOwned: { color: color.inkDark },
  opGlyphDull: { color: color.inkSoft },

  body: { flex: 1 },

  sectionRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { ...type.subtitle, color: color.inkDark },
  countChip: { borderRadius: radius.pill, backgroundColor: board.parchmentSunken },
  countChipText: { ...type.chip, color: color.inkDarkMuted },
  newCountChip: { borderRadius: radius.pill, backgroundColor: color.success },
  newCountChipText: { ...type.chip, color: color.inkDark },

  slotRow: { flexDirection: 'row' },
  slot: {
    flex: 1,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    // The board draws this as `box-shadow: rgb(245,166,35) 0 4px 0` — a hard edge, not a blur.
    borderBottomWidth: 4,
    borderBottomColor: color.amber,
  },
  slotAwaitingSwap: { borderWidth: 2, borderColor: color.gold },
  slotEmpty: {
    flex: 1,
    backgroundColor: board.parchmentSunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: color.parchmentEdge,
  },
  slotGlyph: { ...type.display, color: color.inkDark, includeFontPadding: false },
  slotRange: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },
  emptyPlus: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },
  emptyLabel: { ...type.chip, letterSpacing: 0.44, color: color.inkDarkMuted },

  hint: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.gold },
  hintIcon: {
    backgroundColor: color.inkDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintIconGlyph: { ...type.chip, letterSpacing: 0, color: color.gold },
  hintText: { ...type.caption, flex: 1, fontFamily: type.chip.fontFamily, color: color.inkDark },

  holdScroll: { flex: 1 },
  holdGrid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },
  holdCard: {
    backgroundColor: color.white,
    borderBottomWidth: 4,
  },
  /** Owned, above the band. Sunken parchment is this screen's own word for "not live". */
  holdCardNotYet: { backgroundColor: board.parchmentSunken },
  holdHead: { flexDirection: 'row', alignItems: 'center' },
  holdTile: {
    backgroundColor: board.parchmentSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdTileNotYet: { backgroundColor: board.bandTrack },
  holdTileGlyph: { ...type.display, color: color.inkDark, includeFontPadding: false },
  holdNameCol: { flex: 1, minWidth: 0 },
  holdName: { ...type.subtitle, color: color.inkDark },
  holdRange: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },
  holdSkill: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },

  bandTrack: { backgroundColor: board.bandTrack, overflow: 'hidden' },
  bandFill: { position: 'absolute', top: 0, bottom: 0 },

  holdMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  holdDifficulty: { ...type.chip, letterSpacing: 0, color: '#1E7F41' },
  holdFuse: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },
  holdDamage: { ...type.subtitle, color: color.inkDark },
  holdTemper: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },
  holdWeapon: { ...type.chip, letterSpacing: 0, color: color.inkDarkMuted },

  /**
   * The NOT YET pill. `seaDeep` because white on it is 7.09 — the one blue `tokens.ts` certifies to
   * carry a word, and already in `text-contrast.test.ts`'s certified list. Deliberately dark rather
   * than another parchment tone: on a sunken parchment card a parchment chip is 1.24 against its
   * own ground and would read as a smudge, and the state has to be visible at arm's length.
   *
   * It is never the amber or the success green — those are this app's "yes", and nothing about a
   * gun that cannot fire is a yes.
   */
  notYetChip: {
    borderRadius: radius.pill,
    backgroundColor: color.seaDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notYetChipText: { ...type.chip, color: color.white },
  /** Full width so it always takes its own line inside the wrapping meta row. */
  notYetMessage: { ...type.chip, letterSpacing: 0, width: '100%', color: color.inkDark },

  // Sits proud of the card's top-right corner, exactly as drawn.
  newChip: {
    position: 'absolute',
    right: -4,
    top: -6,
    borderRadius: radius.pill,
    backgroundColor: color.success,
    borderBottomWidth: 2,
    borderBottomColor: board.newChipEdge,
  },
  newChipText: { ...type.chip, letterSpacing: 0.6, color: color.inkDark },

  // The whole card drops onto its own edge — a press a child can feel, on a device with no hover.
  pressedDrop: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
  pressedDim: { opacity: 0.75 },
});
