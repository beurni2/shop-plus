import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { shopPlusTheme as theme } from '@platform/ui-tokens';
import { formatFcfa, type OpportunityCardModel } from './src/earnings';
import exampleCard from './src/opportunity-example.json';
import { t } from './src/i18n';

/**
 * SP0.1 reseller shell: one sparse screen on ui-tokens (shop-plus theme) and
 * catalog strings, showing one NET-FIRST opportunity card (SP-I04/SP-I12) —
 * the net is the large primary figure; gross never renders. Sparse ≠ ugly.
 *
 * The example values are a checked-in snapshot: the RN bundle must not
 * import the @platform/contracts barrel (its node-only drift-check modules
 * do not bundle under Metro); a vitest test pins this snapshot to the pinned
 * computeWaterfall §5.4 baseline, so the numbers can never drift from canon.
 */
const card: OpportunityCardModel = exampleCard;

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" backgroundColor={theme.colors.surface} />
      <View style={styles.content}>
        <Text style={styles.brand}>{t('app.title')}</Text>
        <View style={styles.card}>
          <Text style={styles.productName}>{t('opportunity.example_product')}</Text>
          <Text style={styles.netLabel}>{t('opportunity.net_label')}</Text>
          <Text style={styles.netAmount}>{formatFcfa(card.netFcfa)}</Text>
          <Text style={styles.customerPrice}>
            {t('opportunity.customer_price_label')} : {formatFcfa(card.customerPriceFcfa)}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  brand: {
    color: theme.colors.primary,
    fontSize: theme.typeScale.title.size,
    lineHeight: theme.typeScale.title.lineHeight,
    fontWeight: theme.typeScale.title.weight,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.xl,
    marginTop: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  productName: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.heading.size,
    lineHeight: theme.typeScale.heading.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
  },
  netLabel: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: theme.typeScale.label.weight,
  },
  netAmount: {
    color: theme.colors.success,
    fontSize: theme.typeScale.displayFcfa.size,
    lineHeight: theme.typeScale.displayFcfa.lineHeight,
    fontWeight: theme.typeScale.displayFcfa.weight,
  },
  customerPrice: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
  },
});
