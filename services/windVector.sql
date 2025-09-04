SELECT
    FROM_UNIXTIME( TRUNCATE( UNIX_TIMESTAMP(sa.utc) / (intervale), 0)*(intervale)+(intervale/2) ) AS UTC_grp,

    round( avg((IFNULL( sa.value * cos( RADIANS(360-dd.value * 22.5+90)), 'null' ))), 3) as x,
    round( avg((IFNULL( sa.value * sin( RADIANS(360-dd.value * 22.5+90)), 'null' ))), 3) as y,

    ROUND(
        MOD(
            -(DEGREES(
                atan(
                    avg((IFNULL( sa.value * sin( RADIANS(360-dd.value * 22.5+90)), 'null' ))) ,
                    avg((IFNULL( sa.value * cos( RADIANS(360-dd.value * 22.5+90)), 'null' )))
                )
            )-450),
        360)
    ) AS AvgDirection,

    ROUND(AVG(sa.value), 3) AS AvgSpeed

FROM TA_VARIOUS AS sa -- Speed Average

LEFT JOIN TA_VARIOUS AS dd -- Dominant Direction
    ON ( sa.utc = dd.utc AND dd.sen_id = DominantDirection ) 

WHERE sa.sen_id = SpeedAverage
    AND sa.utc >= start AND sa.utc < stop

GROUP BY UTC_grp
ORDER BY UTC_grp