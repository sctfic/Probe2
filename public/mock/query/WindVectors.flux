  import "math"
  // Récupérer les données de direction
  directionData = from(bucket: "Probe")
      |> range(start: 2025-08-27T16:10:00Z, stop: 2025-09-10T19:40:00Z)
      |> filter(fn: (r) => r.station_id == "VP2_Serramoune")
      |> filter(fn: (r) => r._measurement == "direction")
      |> keep(columns: ["_time", "_value", "sensor"])
      |> rename(columns: {_value: "direction"})
  // Récupérer les données de vitesse
  speedData = from(bucket: "Probe")
      |> range(start: 2025-08-27T16:10:00Z, stop: 2025-09-10T19:40:00Z)
      |> filter(fn: (r) => r.station_id == "VP2_Serramoune")
      |> filter(fn: (r) => r._measurement == "speed")
      |> keep(columns: ["_time", "_value", "sensor"])
      |> rename(columns: {_value: "speed"})
  // Joindre les données et calculer les projections U et V
  windData = join(
      tables: {direction: directionData, speed: speedData},
      on: ["_time", "sensor"]
  )
  |> filter(fn: (r) => exists r.direction and r.direction >= 0.0)
  |> map(fn: (r) => ({
      _time: r._time,
      sensor: r.sensor,
      direction: r.direction,
      speed: r.speed,
      U: r.speed * math.sin(x: math.pi * r.direction / 180.0),
      V: r.speed * math.cos(x: math.pi * r.direction / 180.0)
  }))
  // Calculer séparément les moyennes U et V
  uMean = windData
  |> group(columns: ["sensor"])
  |> aggregateWindow(every: 35947s, fn: mean, column: "U", createEmpty: false)
  |> keep(columns: ["_time", "sensor", "U"])
  |> rename(columns: {U: "UMean"})
  vMean = windData
  |> group(columns: ["sensor"])
  |> aggregateWindow(every: 35947s, fn: mean, column: "V", createEmpty: false)
  |> keep(columns: ["_time", "sensor", "V"])
  |> rename(columns: {V: "VMean"})
  // Joindre les moyennes et recalculer vitesse/direction
  join(tables: {u: uMean, v: vMean}, on: ["_time", "sensor"])
  |> map(fn: (r) => ({
      _time: r._time,
      sensor: r.sensor,
      UMean: r.UMean,
      VMean: r.VMean,
      speedMean: math.sqrt(x: r.UMean * r.UMean + r.VMean * r.VMean),
      directionMean: math.atan2(y: r.UMean, x: r.VMean) * 180.0 / math.pi
  }))
  |> map(fn: (r) => ({
      r with
      directionMean: if r.directionMean < 0.0 then r.directionMean + 360.0 else r.directionMean
  }))
  |> sort(columns: ["_time", "sensor"])
  |> yield()