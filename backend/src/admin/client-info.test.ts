import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBrowser, detectClientInfo, fingerprintTag, formatClientLabel, resolveClientInfo, sanitizeClientInfo } from './client-info.js';

const APP = 'https://localhost';
const WEB = 'https://mercury.example.com';
const ANDROID_PHONE_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET_CHROME = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ANDROID_PHONE_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const DESKTOP_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const WINDOWS_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87';
const WINDOWS_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const MAC_SAFARI = IPAD_DESKTOP_MODE;
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const SAMSUNG_INTERNET = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const FACEBOOK_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBBV/617012345]';
const FINGERPRINT = '0123456789abcdef';

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

test('detectBrowser : navigateur et système, dérivés de Chrome compris', () => {
    assert.deepEqual(detectBrowser(ANDROID_PHONE_CHROME), { browser: 'Chrome', os: 'Android' });
    assert.deepEqual(detectBrowser(IPHONE_SAFARI), { browser: 'Safari', os: 'iOS' });
    assert.deepEqual(detectBrowser(IPHONE_CHROME), { browser: 'Chrome', os: 'iOS' });
    assert.deepEqual(detectBrowser(MAC_SAFARI), { browser: 'Safari', os: 'macOS' });
    assert.deepEqual(detectBrowser(WINDOWS_EDGE), { browser: 'Edge', os: 'Windows' });
    assert.deepEqual(detectBrowser(WINDOWS_FIREFOX), { browser: 'Firefox', os: 'Windows' });
    assert.deepEqual(detectBrowser(SAMSUNG_INTERNET), { browser: 'Samsung Internet', os: 'Android' });
    assert.deepEqual(detectBrowser(FACEBOOK_IOS), { browser: 'Facebook', os: 'iOS' });
    assert.deepEqual(detectBrowser(DESKTOP_CHROME), { browser: 'Chrome', os: 'Linux' });
    assert.deepEqual(detectBrowser('curl/8.0'), {});
    assert.deepEqual(detectBrowser(undefined), {});
});

test('fingerprintTag : étiquette courte et stable, format strict', () => {
    const tag = fingerprintTag(FINGERPRINT);
    assert.match(tag ?? '', /^[0-9a-f]{6}$/);
    assert.equal(fingerprintTag(FINGERPRINT), tag);
    assert.notEqual(fingerprintTag('fedcba9876543210'), tag);
    assert.equal(fingerprintTag('0123456789ABCDEF'), undefined);
    assert.equal(fingerprintTag('0123456789abcdef\nTelegram'), undefined);
    assert.equal(fingerprintTag(42), undefined);
    assert.equal(fingerprintTag(undefined), undefined);
});

test('libellé : navigateur précisé hors appli, empreinte à la fin', () => {
    const web = { platform: 'browser', device: 'mobile' } as const;
    const tag = fingerprintTag(FINGERPRINT);
    assert.equal(formatClientLabel(web, { browser: detectBrowser(IPHONE_SAFARI) }), 'navigateur Safari sur iOS, mobile');
    assert.equal(formatClientLabel(web, { browser: detectBrowser(IPHONE_SAFARI), fingerprint: tag }), `navigateur Safari sur iOS, mobile · empreinte ${tag}`);
    assert.equal(formatClientLabel(web, { browser: detectBrowser('curl/8.0') }), 'navigateur, mobile');
    // L'appli Android tourne dans une WebView : pas de navigateur à nommer.
    const app = { platform: 'android-app', device: 'mobile' } as const;
    assert.equal(formatClientLabel(app, { browser: detectBrowser(ANDROID_PHONE_WEBVIEW), fingerprint: tag }), `appli Android, mobile · empreinte ${tag}`);
    assert.equal(formatClientLabel(undefined, { fingerprint: tag }), `inconnu · empreinte ${tag}`);
});
