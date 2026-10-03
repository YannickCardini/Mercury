import test from 'node:test';
import assert from 'node:assert/strict';
import { describeGuest, describeSignupHistory, isBrowserId, lookupGuestHistory } from './guest-tracking.js';

const NEVER_SEEN = { gamesStarted: 0, firstSeenAt: null };

test('isBrowserId n\'accepte que la forme produite par crypto.randomUUID()', () => {
    assert.equal(isBrowserId('3f2b8c1e-9a4d-4e6f-8b7a-0c1d2e3f4a5b'), true);
    assert.equal(isBrowserId(crypto.randomUUID()), true);
    assert.equal(isBrowserId(undefined), false);
    assert.equal(isBrowserId(''), false);
    assert.equal(isBrowserId(42), false);
    assert.equal(isBrowserId('3F2B8C1E-9A4D-4E6F-8B7A-0C1D2E3F4A5B'), false, 'une seule casse, sinon deux fiches');
    assert.equal(isBrowserId('3f2b8c1e-9a4d-4e6f-8b7a-0c1d2e3f4a5b/../x'), false);
    assert.equal(isBrowserId(' 3f2b8c1e-9a4d-4e6f-8b7a-0c1d2e3f4a5b'), false);
});

test('describeGuest distingue la toute première partie d\'un invité récurrent', () => {
    assert.equal(describeGuest(NEVER_SEEN), 'invité, 1re partie');
    assert.equal(
        describeGuest({ gamesStarted: 1, firstSeenAt: '2026-09-12T18:04:11.000Z' }),
        'invité récurrent, déjà 1 partie depuis le 2026-09-12',
    );
    assert.equal(
        describeGuest({ gamesStarted: 7, firstSeenAt: '2026-09-12T18:04:11.000Z' }),
        'invité récurrent, déjà 7 parties depuis le 2026-09-12',
    );
});

test('describeSignupHistory dit si le nouveau compte avait joué en invité', () => {
    assert.equal(describeSignupHistory(NEVER_SEEN), 'aucune partie en invité sur cet appareil');
    assert.equal(
        describeSignupHistory({ gamesStarted: 3, firstSeenAt: '2026-08-01T07:00:00.000Z' }),
        'déjà 3 parties en invité depuis le 2026-08-01',
    );
});

test('lookupGuestHistory renvoie null pour un id absent ou invalide', async () => {
    assert.equal(await lookupGuestHistory(undefined), null);
    assert.equal(await lookupGuestHistory('not-a-uuid'), null);
});
