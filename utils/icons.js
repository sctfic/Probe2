/**
 * @fileoverview Fichier centralisant les constantes d'icônes et d'emojis pour l'application.
 */

// Emojis de cercles de couleur (Levels)
const O = {
    RED:      '🔴', // U+1F534
    orange:   '🟠', // U+1F7E3
    yellow:   '🟡', // U+1F7E1
    green:    '🟢', // U+1F7E2
    blue:     '🔵', // U+1F535
    purple:   '🟣', // U+1F7E4
    brown:    '🟤', // U+1F7E5
    white:    '⚪', // U+26AA
    black:    '⚫', // U+26AB
    red:      '⭕'  // U+2B55
};

// Emojis de statut et de symboles divers (Various)
const V = {
    Tache:              '🫟', // U+1FADF (Rock)
    Travaux:            '🚧', // U+1F6A7 (Construction)
    Gyro:               '🚨', // U+1F6A8 (Siren)
    Megaphone:          '📢', // U+1F4E2 (Loudspeaker)
    Check:              '✅', // U+2705  (Check Mark)
    Warn:               '⚠️', // U+26A0  (Warning)
    Ampoule:            '💡', // U+1F526 (Light Bulb)
    connect:            '🔌', // U+1F50C (Outlet)
    Parabol:            '📡', // U+1F512 (Satellite Antenna)
    satellite:           '🛰 ', // U+1F680 (Space Station)
    StartFlag:          '🏁', // U+1F3C1 (Finish Line)
    RedFlag:            '🚩', // U+1F6A9 (Triangular Flag)
    BlackFlag:          '🏴', // U+1F3F4 (Black Flag)
    EmptyFlag:          '🏳', // U+1F3F3 (White Flag)
    Radioactive:        '☢', // U+2622 (Radioactive)
    Biohazard:          '☣', // U+2623 (Biohazard)
    send:               '↗', // U+2197 (North-East Arrow)
    receive:            '↙', // U+2198 (South-East Arrow)
    transmission:       '↔', // U+2194 (Left/Right Arrow)
    books:              '📚', // U+1F4DA (Books)
    book:               '📖', // U+1F4DA (Books)
    package:            '📦', // U+1F4E6 (Package)
    cut:                '✂️', // U+1F5    '✂', // U+2705 (Scissors)
    timeout:            '⌛', // U+23F1 (Hourglass)
    Error:              '❌', // U+274C (Cross Mark)
    success:            '✅', // U+2705 (Check Mark)
    info:               'ℹ️ ', // U+2139 (Information)
    fuck:               '🖕', // U+1F590 (Hand)
    sleep:              '💤', // U+1F590 (Sleeping)
    clock:              '⏱', // U+1F590 (Clock)
    write:              '📝', // U+1F4D0 (write)
    read:               '👓', // U+1F453 (Read)
    eu:                 '🇪🇺', // U+1F1EA (Europe)
    sunrise:            '🌅', // U+1F303 (Sunrise)
    error:              '❌',
    warning:            '⚠️',
    rocket:             '🚀',
    gear:               '⚙️ ',
    database:           '💾',
    network:            '🌐',
    memory:             '💾',
    cpu:                '⚡',
    fail:               '❌',
    trash:              '🗑️',
    loading:            '⏳',
    wifi:               '📶',
    thermometer:        '🌡️',
    droplet:            '💧',
    wind:               '💨',
    eye:                '👁️ ',
    chart:              '📊'
};

const forecast = {
    sun:           '🌞', // 'U+1F31E' (sun)
    cloud:         '☁', // 'U+2601' (cloud)
    rain:          '⛅', // 'U+26C5' (rain)
    storm:         '⛈', // 'U+26C8' (storm)
    sunSmallCloud: '🌤', // 'U+1F324' (sun behind small cloud)
    sunLargeCloud: '🌥', // 'U+1F325' (sun behind large cloud)
    sunRainCloud:  '🌦', // 'U+1F326' (sun behind rain cloud)
    sunSnowCloud:  '🌨', // 'U+1F327' (cloud with rain)
    sunSnowCloud:  '🌨', // 'U+1F328' (cloud with snow)
    sunLightningCloud: '🌩', // 'U+1F329' (cloud with lightning)
    tornado:       '🌪', // 'U+1F32A' (tornado)
    fog:           '🌫', // 'U+1F32B' (fog)
}
module.exports = { O, V, forecast };