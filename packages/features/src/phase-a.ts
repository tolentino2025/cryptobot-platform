import type {
  ComputedFeatures,
  MarketSnapshot,
  PhaseAReports,
  TechnicalAnalysisReport,
  MarketIntelligenceReport,
} from '@cryptobot/shared-types';

export class PhaseAAnalysisService {
  async analyze(snapshot: MarketSnapshot, features: ComputedFeatures): Promise<PhaseAReports> {
    const [marketIntelligence, technicalAnalysis] = await Promise.all([
      Promise.resolve(this.runMarketIntelligenceAgent(features)),
      Promise.resolve(this.runTechnicalAnalysisAgent(snapshot, features)),
    ]);

    return { marketIntelligence, technicalAnalysis };
  }

  private runMarketIntelligenceAgent(features: ComputedFeatures): MarketIntelligenceReport {
    const volatilityClassification =
      Math.abs(features.priceChangePercent5m) > 1.25 || features.realizedVolatility > 0.006
        ? 'EXTREME'
        : Math.abs(features.priceChangePercent5m) > 0.45 || features.realizedVolatility > 0.003
          ? 'ELEVATED'
          : 'CALM';

    const liquidityState =
      features.volumeRatio < 0.2 || features.spreadBps > 8
        ? 'STRESSED'
        : features.volumeRatio < 0.55 || features.spreadBps > 4
          ? 'THIN'
          : 'HEALTHY';

    const sentiment =
      features.priceChangePercent5m > 0.25 && features.tradeFlowImbalance > 0.55
        ? 'RISK_ON'
        : features.priceChangePercent5m < -0.25 && features.tradeFlowImbalance < 0.45
          ? 'RISK_OFF'
          : 'NEUTRAL';

    const macroBias =
      features.emaFast > features.emaSlow && features.bookImbalance >= 1
        ? 'BULLISH'
        : features.emaFast < features.emaSlow && features.bookImbalance < 1
          ? 'BEARISH'
          : 'NEUTRAL';

    return {
      sentiment,
      volatilityClassification,
      liquidityState,
      macroBias,
      summary: `${sentiment} / ${volatilityClassification} volatility / liquidity ${liquidityState} / bias ${macroBias}`,
    };
  }

  private runTechnicalAnalysisAgent(
    snapshot: MarketSnapshot,
    features: ComputedFeatures,
  ): TechnicalAnalysisReport {
    const trendDirection =
      Math.abs(features.emaFast - features.emaSlow) < snapshot.ticker.last * 0.0005
        ? 'SIDEWAYS'
        : features.emaFast > features.emaSlow
          ? 'UP'
          : 'DOWN';

    const momentumState =
      features.rsi >= 68
        ? 'OVERBOUGHT'
        : features.rsi <= 32
          ? 'OVERSOLD'
          : 'NEUTRAL';

    const setupQuality =
      features.volumeRatio >= 1 &&
      features.spreadBps <= 4 &&
      features.bookImbalance >= 1 &&
      Math.abs(features.priceChangePercent5m) <= 1
        ? 'HIGH'
        : features.volumeRatio >= 0.55 &&
            features.spreadBps <= 6 &&
            features.bookImbalance >= 0.7
          ? 'MEDIUM'
          : 'LOW';

    const closes = snapshot.candles1m.map((c) => c.close);
    const support = closes.length > 0 ? Math.min(...closes.slice(-20)) : snapshot.ticker.last;
    const resistance = closes.length > 0 ? Math.max(...closes.slice(-20)) : snapshot.ticker.last;

    return {
      trendDirection,
      momentumState,
      setupQuality,
      keyLevels: {
        support,
        resistance,
      },
      summary: `${trendDirection} trend / ${momentumState} momentum / setup ${setupQuality}`,
    };
  }
}
