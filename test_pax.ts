
import { sanitizeFlightRequest } from './src/utils/flightParser';

const test1 = { origin: 'OTP', destination: 'MIL', departureDate: '2026-05-01', adults: 4 };
const res1 = sanitizeFlightRequest(test1);
console.log('Test 1 (adults=4):', res1.passengers === 4 ? 'PASS' : 'FAIL', res1.passengers);

const test2 = { origin: 'OTP', destination: 'MIL', departureDate: '2026-05-01', passengers: 3 };
const res2 = sanitizeFlightRequest(test2);
console.log('Test 2 (passengers=3):', res2.passengers === 3 ? 'PASS' : 'FAIL', res2.passengers);

const test3 = { origin: 'OTP', destination: 'MIL', departureDate: '2026-05-01' };
const res3 = sanitizeFlightRequest(test3);
console.log('Test 3 (default=1):', res3.passengers === 1 ? 'PASS' : 'FAIL', res3.passengers);
