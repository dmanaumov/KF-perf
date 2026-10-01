const connectors = [require('./yandexDirect'), require('./metrika'), require('./googleAds'), require('./vkAds'), require('./meta')];
const BY_PLATFORM = Object.fromEntries(connectors.map((c) => [c.platform, c]));

// Описание полей для UI (без функций)
function describe() {
  return Object.fromEntries(connectors.map((c) => [c.platform, { fields: c.fields, settingsFields: c.settingsFields }]));
}

module.exports = { get: (p) => BY_PLATFORM[p] || null, describe };
