import test from 'node:test';
import assert from 'node:assert/strict';
import { detectClientInfo, formatClientLabel, resolveClientInfo, sanitizeClientInfo } from './client-info.js';

const APP = 'https://localhost';
const WEB = 'https://mercury.example.com';
const ANDROID_PHONE_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET_CHROME = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ANDROID_PHONE_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const DESKTOP_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

test('appli Android sur téléphone', () => {
    const info = detectClientInfo({ origin: APP, userAgent: ANDROID_PHONE_WEBVIEW });
    assert.deepEqual(info, { platform: 'android-app', device: 'mobile' });
    assert.equal(formatClientLabel(info), 'appli Android, mobile');
});

test('appli Android sur tablette (UA Android sans Mobile)', () => {
    assert.deepEqual(detectClientInfo({ origin: APP, userAgent: ANDROID_TABLET_CHROME }), { platform: 'android-app', device: 'tablet' });
});

test('Chrome sur Android téléphone', () => {
    assert.deepEqual(detectClientInfo({ origin: WEB, userAgent: ANDROID_PHONE_CHROME }), { platform: 'browser', device: 'mobile' });
});

test('Safari sur iPhone', () => {
    assert.deepEqual(detectClientInfo({ origin: WEB, userAgent: IPHONE_SAFARI }), { platform: 'browser', device: 'mobile' });
});

test('iPad : tablette, sauf en mode ordinateur (angle mort connu)', () => {
    assert.equal(detectClientInfo({ origin: WEB, userAgent: IPAD_OLD }).device, 'tablet');
    assert.equal(detectClientInfo({ origin: WEB, userAgent: IPAD_DESKTOP_MODE }).device, 'desktop');
});

test('navigateur ordinateur, y compris le localhost de dev', () => {
    const info = detectClientInfo({ origin: 'http://localhost:4200', userAgent: DESKTOP_CHROME });
    assert.deepEqual(info, { platform: 'browser', device: 'desktop' });
    assert.equal(formatClientLabel(info), 'navigateur, ordinateur');
});

test('en-têtes absents ou invalides : inconnu, jamais d\'exception', () => {
    assert.deepEqual(detectClientInfo({}), {});
    assert.deepEqual(detectClientInfo({ origin: 42, userAgent: ['x'] }), {});
    assert.equal(formatClientLabel(detectClientInfo({})), 'inconnu');
    assert.equal(formatClientLabel(undefined), 'inconnu');
    assert.equal(formatClientLabel({ device: 'tablet' }), 'inconnu, tablette');
});

test('sanitizeClientInfo rejette tout ce qui n\'est pas une valeur attendue', () => {
    assert.deepEqual(sanitizeClientInfo({ platform: 'android-app', device: 'tablet' }), { platform: 'android-app', device: 'tablet' });
    assert.deepEqual(sanitizeClientInfo({ platform: '<b>x</b>', device: 'tablet' }), { device: 'tablet' });
    assert.deepEqual(sanitizeClientInfo('texte'), {});
    assert.deepEqual(sanitizeClientInfo(null), {});
});

test('le libellé n\'est jamais fait de texte venu du client', () => {
    const info = resolveClientInfo({ platform: 'evil\nTelegram', device: 'mobile\n' }, { origin: WEB, userAgent: 'evil\nUA' });
    assert.equal(formatClientLabel(info), 'navigateur, ordinateur');
});

test('la déclaration du client l\'emporte sur les en-têtes, qui comblent les manques', () => {
    // Tablette Android en mode « site pour ordinateur » : l'UA dit ordinateur, le client sait.
    const declared = resolveClientInfo({ platform: 'browser', device: 'tablet' }, { origin: WEB, userAgent: DESKTOP_CHROME });
    assert.deepEqual(declared, { platform: 'browser', device: 'tablet' });
    // Build ancien : pas de déclaration, les en-têtes décident.
    assert.deepEqual(resolveClientInfo(undefined, { origin: APP, userAgent: ANDROID_PHONE_WEBVIEW }), { platform: 'android-app', device: 'mobile' });
    // Déclaration partielle : le champ manquant vient des en-têtes.
    assert.deepEqual(resolveClientInfo({ device: 'tablet' }, { origin: WEB, userAgent: DESKTOP_CHROME }), { platform: 'browser', device: 'tablet' });
});
