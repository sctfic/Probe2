
 // 1. Récupérer les données de direction Gust
 directionData = from(bucket: "Probe")
             |> range(start: 1756084800, stop: 1756854600)
             |> filter(fn: (r) => r.station_id == "VP2_Serramoune")
             |> filter(fn: (r) => r._measurement == "direction")
             |> filter(fn: (r) => r.sensor == "Gust")
             |> keep(columns: ["_time", "_value", "sensor"])
             |> rename(columns: {_value: "direction"})


 // 2. Récupérer les données de vitesse Gust
 speedData = from(bucket: "Probe")
             |> range(start: 1756084800, stop: 1756854600)
             |> filter(fn: (r) => r.station_id == "VP2_Serramoune")
             |> filter(fn: (r) => r._measurement == "speed")
             |> filter(fn: (r) => r.sensor == "Gust")
             |> keep(columns: ["_time", "_value", "sensor"])
             |> rename(columns: {_value: "speed"})

             // 3. Joindre les données de direction et de vitesse par _time
             grpPetal = join(
               tables: {direction: directionData, speed: speedData},
               on: ["_time","sensor"]
             )

             // 5. Agréger par intervalle et par petal
             |> group(columns: ["direction","sensor"])
            count = grpPetal
              |> aggregateWindow(every: 256600s, fn: count, column: "speed", createEmpty: false)
              |> rename(columns: { speed: "count"})

            gust = grpPetal
              |> filter(fn: (r) => r.sensor == "Gust")
              |> aggregateWindow(every: 256600s, fn: max, column: "speed", createEmpty: false)
              |> drop(columns: ["_start", "_stop"])
            gCount = count
              |> filter(fn: (r) => r.sensor == "Gust")
              |> drop(columns: ["_start", "_stop"])
            avg = grpPetal
              |> filter(fn: (r) => r.sensor == "Speed")
              |> aggregateWindow(every: 256600s, fn: mean, column: "speed", createEmpty: false)
              |> drop(columns: ["_start", "_stop"])
            aCount = count
              |> filter(fn: (r) => r.sensor == "Speed")
              |> drop(columns: ["_start", "_stop"])

            gustC = join(
                tables: {gCount: gCount, gust: gust},
                on: ["direction","_time"]
              )

            avgC = join(
                tables: {aCount: aCount, avg: avg},
                on: ["direction","_time"]
              )

            join(
                tables: {avg: avgC, gust: gustC},
                on: ["direction","_time"]
              )
              |> drop(columns: ["_start", "_stop","sensor_gust","sensor_avg", "sensor_aCount","sensor_gCount"])
              |> yield()



voici la structure de mes data dans mon bucket influxdb
"_measure": {
    "direction": {
        "tags": {
            "sensor": [
                "Gust",
                "Speed"
            ],
            "station_id": [
                "VP2_Serramoune"
            ],
            "unit": [
                "°"
            ]
        },
        "fields": [
            "value"
        ]
    },
    "speed": {
        "tags": {
            "sensor": [
                "Gust",
                "Speed"
            ],
            "station_id": [
                "VP2_Serramoune"
            ],
            "unit": [
                "m/s"
            ]
        },
        "fields": [
            "value"
        ]
    }
}
