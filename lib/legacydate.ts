import { Instant } from './instant';

import JSBI from 'jsbi';
import * as ES from './ecmascript';

export function toTemporalInstant(this: Date) {
  // Observable access to valueOf is not correct here, but unavoidable
  const epochNanoseconds = JSBI.multiply(JSBI.BigInt(+this), JSBI.BigInt(1e6));
  return new Instant(ES.ToBigInt(epochNanoseconds));
}
