import { config } from '@/config'
import { AssetPair, GateNewTriggeredOrderDetails, SymbolName } from '@/service/gate-client/types'
import { applyPercentage, toFixed } from '@/lib/math'
import { SpotPricePutOrder, SpotPriceTrigger } from 'gate-api'
import { OperationError } from '../operation-error'
import { OperationErrorCode } from '../operation-error/types'
import { Logger } from '../../../../lib/logger'
import { Gate } from '@/service/gate-client'
import { OperationTriggeredOrderDetails } from '../types'

export async function createTakeProfitTriggeredOrder(
  symbol: SymbolName,
  assetPair: AssetPair,
  startTime: number,
  operationEntryPrice: string,
  amount: string,
  logger: Logger
): Promise<OperationTriggeredOrderDetails> {
  /**
   * 
   * Calculate amounts and sizes
   * 
   */

  const amountMinusFees = applyPercentage(Number(amount), config.gate.feesPercent * -1)
  const usdtPrecision = Gate.assetPairs[assetPair].precision!
  const currencyPrecision = Gate.assetPairs[assetPair].amountPrecision!
  const sellAmount = toFixed(amountMinusFees, currencyPrecision)
  const triggerPrice = toFixed(applyPercentage(Number(operationEntryPrice), config.takeProfit.triggerDistancePercent), usdtPrecision)
  const sellPrice = toFixed(applyPercentage(Number(operationEntryPrice), config.takeProfit.sellDistancePercent), usdtPrecision)

  logger.lineBreak()
  logger.log('Creating TAKE PROFIT order...')
  logger.log(' - Sell amount :', Number(sellAmount), symbol)
  logger.log(' - Trigger condition : >', Number(triggerPrice), `USDT (buyPrice + ${config.takeProfit.triggerDistancePercent}%)`)
  logger.log(' - Sell price :', Number(sellPrice), `USDT (buyPrice + ${config.takeProfit.sellDistancePercent}%)`)

  /**
   * 
   * Create TAKE PROFIT order
   * 
   */
  let order: GateNewTriggeredOrderDetails
  try {
    const { response } = await Gate.spot.createSpotPriceTriggeredOrder({
      market: assetPair,
      trigger: {
        price: triggerPrice,
        rule: SpotPriceTrigger.Rule.GreaterThanOrEqualTo,
        expiration: config.takeProfit.orderExpiration
      },
      put: {
        type: "limit",
        side: SpotPricePutOrder.Side.Sell,
        price: sellPrice,
        amount: sellAmount,
        account: SpotPricePutOrder.Account.Normal,
        timeInForce: SpotPricePutOrder.TimeInForce.Ioc
      },
    })
    order = response.data
  } catch (e) {
    throw new OperationError(
      `Error when trying to execute TAKE PROFIT order "${assetPair}"`,
      { code: OperationErrorCode.ERROR_CREATING_TAKE_PROFIT_ORDER, details: Gate.getGateResponseError(e) }
    )
  }

  /**
   * 
   * Ready!
   * 
   */
  logger.success(' - Ready!')
  logger.log(' - Take Profit order ID :', order.id)
  logger.log(' - Time since trade start :', Date.now() - startTime, 'ms')
  return {
    id: order.id,
    triggerPrice: triggerPrice,
    amount: sellAmount,
    sellPrice: sellPrice,
    order: order
  }
}
