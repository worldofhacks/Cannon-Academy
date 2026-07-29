import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ResponsiveFrame } from '../src/components/ResponsiveFrame';
import {
  buyHarborChest,
  harborCatalog,
  harborCoinBalance,
  harborLastReceipt,
  type HarborPurchaseResult,
} from '../src/services/harbor';
import { captainStore, useCaptain } from '../src/stores/useCaptain';
import { projectChestCeremony } from '../src/theme/chestRarity';
import {
  HARBOR_PURCHASE_TARGET,
  harborBalanceLabel,
  harborProductTitle,
  harborPurchaseLabel,
} from '../src/theme/harborPresentation';
import { color, font, radius, type } from '../src/theme/tokens';
import { useLayout } from '../src/theme/useLayout';

/**
 * Harbor store — spend earned coins on a game chest.
 *
 * Settlement lives in `services/harbor.ts` and durable reward settlement; this screen lists the
 * catalog, shows the coin balance, and renders the last committed receipt without rerolling.
 */
export default function Harbor() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const captain = useCaptain((s) => s.captain);
  const products = useMemo(() => harborCatalog(), []);
  const balance = harborCoinBalance(captain);
  const retained = harborLastReceipt(captain);

  const [lastResult, setLastResult] = useState<HarborPurchaseResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onBuy = useCallback(() => {
    const result = buyHarborChest(captainStore);
    setLastResult(result);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setNotice(null);
  }, []);

  const receipt = lastResult?.ok ? lastResult.receipt : retained;
  const ceremony =
    receipt === null
      ? null
      : projectChestCeremony(receipt, {
          coins: captain.coins,
          cannons: [],
        });

  return (
    <ResponsiveFrame surface="reading">
      <View
        style={{
          flex: 1,
          backgroundColor: color.deepSea,
          paddingTop: insets.top + L.a(12),
          paddingHorizontal: L.gutter,
          paddingBottom: insets.bottom + L.a(16),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: L.a(16) }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              minWidth: HARBOR_PURCHASE_TARGET * L.type,
              minHeight: HARBOR_PURCHASE_TARGET * L.type,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: font.displayBold, fontSize: type.title.fontSize * L.type, color: color.ink }}>
              ←
            </Text>
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: font.displayBold,
              fontSize: type.display.fontSize * L.type,
              color: color.ink,
            }}
          >
            Harbor
          </Text>
          <View style={{ width: HARBOR_PURCHASE_TARGET * L.type }} />
        </View>

        <View
          style={{
            alignSelf: 'center',
            backgroundColor: color.parchment,
            borderRadius: radius.card * L.type,
            paddingHorizontal: L.a(20),
            paddingVertical: L.a(12),
            marginBottom: L.a(20),
          }}
        >
          <Text
            style={{
              fontFamily: font.displayBold,
              fontSize: type.title.fontSize * L.type,
              color: color.inkDark,
              textAlign: 'center',
            }}
          >
            {harborBalanceLabel(balance)}
          </Text>
        </View>

        {products.map((product) => (
          <View
            key={product.id}
            style={{
              backgroundColor: color.parchment,
              borderRadius: radius.card * L.type,
              padding: L.a(16),
              marginBottom: L.a(16),
              gap: L.a(12),
            }}
          >
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: type.title.fontSize * L.type,
                color: color.inkDark,
              }}
            >
              {harborProductTitle}
            </Text>
            <Text
              style={{
                fontFamily: font.bodyMedium,
                fontSize: type.body.fontSize * L.type,
                lineHeight: type.body.lineHeight * L.type,
                color: color.inkDarkMuted,
              }}
            >
              Open a game chest for {harborPurchaseLabel}. Earn cannons by learning — not by buying them
              directly.
            </Text>
            <Pressable
              onPress={onBuy}
              accessibilityRole="button"
              accessibilityLabel={`Buy game chest for ${harborPurchaseLabel}`}
              style={({ pressed }) => [
                {
                  minHeight: HARBOR_PURCHASE_TARGET * L.type,
                  borderRadius: radius.card * L.type,
                  backgroundColor: color.gold,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: L.a(16),
                  opacity: balance < product.price ? 0.55 : 1,
                },
                pressed ? { transform: [{ translateY: 2 }] } : null,
              ]}
            >
              <Text
                style={{
                  fontFamily: font.displayBold,
                  fontSize: type.title.fontSize * L.type,
                  color: color.inkDark,
                }}
              >
                {harborPurchaseLabel}
              </Text>
            </Pressable>
            {notice !== null ? (
              <Text
                style={{
                  fontFamily: font.bodyBold,
                  fontSize: type.body.fontSize * L.type,
                  color: color.dangerInk,
                }}
              >
                {notice}
              </Text>
            ) : null}
          </View>
        ))}

        {ceremony !== null ? (
          <View
            style={{
              backgroundColor: ceremony.look.fill,
              borderColor: ceremony.look.border,
              borderWidth: 2,
              borderRadius: radius.card * L.type,
              padding: L.a(16),
              gap: L.a(8),
            }}
          >
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: type.title.fontSize * L.type,
                color: ceremony.look.label,
              }}
            >
              {ceremony.label} game chest opened
            </Text>
            <Text
              style={{
                fontFamily: font.bodyBold,
                fontSize: type.body.fontSize * L.type,
                color: ceremony.look.label,
              }}
            >
              {ceremony.grant.kind === 'cannon'
                ? `New cannon: ${ceremony.grant.displayName}`
                : `${ceremony.grant.amount} coins inside`}
            </Text>
          </View>
        ) : null}
      </View>
    </ResponsiveFrame>
  );
}
