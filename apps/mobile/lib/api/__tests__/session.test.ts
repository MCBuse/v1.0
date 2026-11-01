import { authSession } from '../session';
import { tokenStorage } from '../storage';

jest.mock('../storage', () => ({
  tokenStorage: { load: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));

const save = tokenStorage.save as jest.Mock;
const a = { accessToken: 'a1', refreshToken: 'r1' };
const b = { accessToken: 'a2', refreshToken: 'r2' };

beforeEach(async () => {
  await authSession.clear();
  save.mockClear();
});

test('an unverified (transient) session is usable but never written to storage', async () => {
  authSession.setTransient(a);
  await authSession.rotate(b); // refresh during verification
  expect(authSession.get()).toEqual(b);
  expect(save).not.toHaveBeenCalled();
});

test('verification promotes the live tokens to storage', async () => {
  authSession.setTransient(a);
  await authSession.set(b);
  await authSession.rotate(a);
  expect(save.mock.calls).toEqual([[b], [a]]);
});

test('clearing a transient session resets to persisted mode', async () => {
  authSession.setTransient(a);
  await authSession.clear();
  await authSession.rotate(b);
  expect(save).toHaveBeenCalledWith(b);
});
