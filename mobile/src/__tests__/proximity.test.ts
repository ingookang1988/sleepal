import { RssiProximityEstimator } from '../ble/proximity';

describe('RSSI proximity estimate', () => {
  it('requires sustained filtered samples', () => {
    const estimator = new RssiProximityEstimator(-45, 3, 3);
    expect(estimator.update(-42).veryNear).toBe(false);
    expect(estimator.update(-41).veryNear).toBe(false);
    expect(estimator.update(-43).veryNear).toBe(true);
  });

  it('resets the hold when the median falls below the threshold', () => {
    const estimator = new RssiProximityEstimator(-45, 3, 2);
    estimator.update(-40);
    estimator.update(-41);
    expect(estimator.update(-80).veryNear).toBe(true);
    expect(estimator.update(-80).veryNear).toBe(false);
  });
});
