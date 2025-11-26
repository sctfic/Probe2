[
    {
      "SEN_ID": -10,
      "SEN_NAME": "TV:Arch:Various:Wind:full",
      "SEN_MAGNITUDE": "WindSpeed",
      "SEN_ENGINE_UNIT": "m/s",
      "SEN_USER_UNIT": "km/h",
      "SEN_HUMAN_NAME": "Vitesse des vents",
      "SEN_DESCRIPTIF": "Vitesse moyenne, rafale et Delta-Variation",
      "SEN_FUNCTION": "val = function (d) { return toHumanUnit(+d.val); };valUp = function (d) { return toHumanUnit(+d.valUp); }; valDown = function (d) { return 0; };",
      "SEN_DEPENDENCY_JSON": {
        "val": {
          "sensor": "TA:Arch:Various:Wind:SpeedAvg",
          "SQL_GRP_MODE": "AVG"
        },
        "valUp": {
          "sensor": "TA:Arch:Various:Wind:HighSpeed",
          "SQL_GRP_MODE": "MAX"
        },
        "valDown": {
          "sensor": "TA:Arch:Various:Wind:SpeedAvg",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curves"
    },
    {
      "SEN_ID": -9,
      "SEN_NAME": "TA:Arch:Hum:InOut:Full",
      "SEN_MAGNITUDE": "Percent",
      "SEN_ENGINE_UNIT": "%",
      "SEN_USER_UNIT": "%",
      "SEN_HUMAN_NAME": "Humidité Interieure, Exterieure et Delta",
      "SEN_DESCRIPTIF": "Humidité Interieure, Exterieure et Delta",
      "SEN_FUNCTION": "val = function (d) { return toHumanUnit(+d.val); }; valUp = function (d) { return toHumanUnit(+d.valUp); }; valDown = function (d) { return toHumanUnit(Math.abs(+d.valUp-d.val)); };",
      "SEN_DEPENDENCY_JSON": {
        "val": {
          "sensor": "TA:Arch:Hum:Out:Current",
          "SQL_GRP_MODE": "AVG"
        },
        "valUp": {
          "sensor": "TA:Arch:Hum:In:Current",
          "SQL_GRP_MODE": "AVG"
        },
        "valDown": {
          "sensor": "",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curves"
    },
    {
      "SEN_ID": -8,
      "SEN_NAME": "TV:Arch:Various:UV:Full",
      "SEN_MAGNITUDE": "UV",
      "SEN_ENGINE_UNIT": "Idx",
      "SEN_USER_UNIT": "Idx",
      "SEN_HUMAN_NAME": "Radiation UV moyenne, maxi et Delta",
      "SEN_DESCRIPTIF": "Radiation UV moyenne, maxi et Delta",
      "SEN_FUNCTION": "val = function (d) { return toHumanUnit(+d.val); }; valUp = function (d) { return toHumanUnit(+d.valUp); }; valDown = function (d) { return toHumanUnit(Math.abs(+d.valUp-d.val)); };",
      "SEN_DEPENDENCY_JSON": {
        "val": {
          "sensor": "TA:Arch:Various:UV:IndexAvg",
          "SQL_GRP_MODE": "AVG"
        },
        "valUp": {
          "sensor": "TA:Arch:Various:UV:HighIndex",
          "SQL_GRP_MODE": "MAX"
        },
        "valDown": {
          "sensor": "",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curves"
    },
    {
      "SEN_ID": -7,
      "SEN_NAME": "TV:Arch:Various:Solar:full",
      "SEN_MAGNITUDE": "Solar",
      "SEN_ENGINE_UNIT": "w/m²",
      "SEN_USER_UNIT": "w/m²",
      "SEN_HUMAN_NAME": "Radiation Solaire moyenne, maxi et Delta",
      "SEN_DESCRIPTIF": "Radiation Solaire moyenne, maxi et Delta",
      "SEN_FUNCTION": "val = function (d) { return toHumanUnit(+d.val); }; valUp = function (d) { return toHumanUnit(+d.valUp); }; valDown = function (d) { return toHumanUnit(Math.abs(+d.valUp-d.val)); };",
      "SEN_DEPENDENCY_JSON": {
        "val": {
          "sensor": "TA:Arch:Various:Solar:Radiation",
          "SQL_GRP_MODE": "AVG"
        },
        "valUp": {
          "sensor": "TA:Arch:Various:Solar:HighRadiation",
          "SQL_GRP_MODE": "MAX"
        },
        "valDown": {
          "sensor": "",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curves"
    },
    {
      "SEN_ID": -6,
      "SEN_NAME": "TV:Arch:Temp:Out:Full",
      "SEN_MAGNITUDE": "Temperature",
      "SEN_ENGINE_UNIT": "K",
      "SEN_USER_UNIT": "°C",
      "SEN_HUMAN_NAME": "Intervale de temperature",
      "SEN_DESCRIPTIF": "Coube de temperature avec mini et maxi inclus",
      "SEN_FUNCTION": "val = function (d) { return toHumanUnit(+d.val); }; valUp = function (d) { return toHumanUnit(+d.valUp+1); }; valDown = function (d) { return toHumanUnit(+d.valDown-1); };",
      "SEN_DEPENDENCY_JSON": {
        "val": {
          "sensor": "TA:Arch:Temp:Out:Average",
          "SQL_GRP_MODE": "AVG"
        },
        "valUp": {
          "sensor": "TA:Arch:Temp:Out:High",
          "SQL_GRP_MODE": "MAX"
        },
        "valDown": {
          "sensor": "TA:Arch:Temp:Out:Low",
          "SQL_GRP_MODE": "MIN"
        }
      },
      "SEN_DEF_PLOT": "curves"
    },
    {
      "SEN_ID": -5,
      "SEN_NAME": "TV:Arch:Sun:Out:Phase",
      "SEN_MAGNITUDE": "Percent",
      "SEN_ENGINE_UNIT": "",
      "SEN_USER_UNIT": "%",
      "SEN_HUMAN_NAME": "Sun Phase",
      "SEN_DESCRIPTIF": "Position du soleil par rapport a l'orizon",
      "SEN_FUNCTION": "val = function (d) { var sunPos = SunCalc.getPosition(dateParser(d), dataheader.ISS.lat, dataheader.ISS.lon); return sunPos.altitude; }",
      "SEN_DEPENDENCY_JSON": {
        "null": {
          "sensor": "TIME_AUTO",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curve"
    },
    {
      "SEN_ID": -4,
      "SEN_NAME": "TV:Arch:Temp:Out:THSW",
      "SEN_MAGNITUDE": "Temperature",
      "SEN_ENGINE_UNIT": "K",
      "SEN_USER_UNIT": "°C",
      "SEN_HUMAN_NAME": "THSW",
      "SEN_DESCRIPTIF": "Like Heat Index, the THSW Index uses humidity and temperature to calculate an apparent temperature. In addition, THSW incorporates the heating effects of solar radiation and the cooling effects of wind (like wind chill) on our perception of temperature.",
      "SEN_FUNCTION": "val=function(d){ return toHumanUnit(d.T0); }",
      "SEN_DEPENDENCY_JSON": {
        "T0": {
          "sensor": "TA:Arch:Temp:Out:Average",
          "SQL_GRP_MODE": "AVG"
        },
        "W0": {
          "sensor": "TA:Arch:Various:Wind:SpeedAvg",
          "SQL_GRP_MODE": "AVG"
        },
        "S0": {
          "sensor": "TA:Arch:Various:Solar:Radiation",
          "SQL_GRP_MODE": "AVG"
        },
        "H0": {
          "sensor": "TA:Arch:Hum:Out:Current",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curve"
    },
    {
      "SEN_ID": -3,
      "SEN_NAME": "TV:Arch:Moon:Out:Phase",
      "SEN_MAGNITUDE": "Percent",
      "SEN_ENGINE_UNIT": "",
      "SEN_USER_UNIT": "%",
      "SEN_HUMAN_NAME": "Moon Phase",
      "SEN_DESCRIPTIF": "Phase de la lune",
      "SEN_FUNCTION": "val = function (d) { var moonPos = SunCalc.getMoonPosition(dateParser(d), dataheader.ISS.lat, dataheader.ISS.lon); return moonPos.altitude; }",
      "SEN_DEPENDENCY_JSON": {
        "null": {
          "sensor": "TIME_AUTO",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curve"
    },
    {
      "SEN_ID": -2,
      "SEN_NAME": "TV:Arch:Temp:Out:DEWPOINT",
      "SEN_MAGNITUDE": "Temperature",
      "SEN_ENGINE_UNIT": "K",
      "SEN_USER_UNIT": "°C",
      "SEN_HUMAN_NAME": "DEWPOINT",
      "SEN_DESCRIPTIF": "Point de rosée, temperature a laquelle l'humiditée ambiante se condance en goutelette (brouillard)",
      "SEN_FUNCTION": "/* …dewPoint calculation… */ val = function (d){ return toHumanUnit(dewPoint(+d.RH, +d.T)); }",
      "SEN_DEPENDENCY_JSON": {
        "T": {
          "sensor": "TA:Arch:Temp:Out:Average",
          "SQL_GRP_MODE": "AVG"
        },
        "RH": {
          "sensor": "TA:Arch:Hum:Out:Current",
          "SQL_GRP_MODE": "AVG"
        }
      },
      "SEN_DEF_PLOT": "curve"
    }
  ]