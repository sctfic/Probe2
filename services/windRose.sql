SELECT
    FROM_UNIXTIME( TRUNCATE( UNIX_TIMESTAMP(sa.utc) / (intervale), 0)*(intervale)+(intervale/2) ) AS UTC_grp,
    IFNULL( dd.value * 22.5, 'null' ) AS DominantDirection,
    COUNT(sa.utc) AS SampleCount,
    ROUND(AVG(sa.value), 3) AS SpeedAverage,
    UTC_grpMaxSpeedInThisDirection
FROM TA_VARIOUS AS sa -- Speed Average

LEFT JOIN TA_VARIOUS AS dd -- Dominant Direction
    ON (sa.utc = dd.utc AND dd.sen_id = DominantDirection)

LEFT JOIN (
    SELECT
         DATE(md.utc) AS MaxDir_UTC, md.value AS MaxDirection, MAX(ms.value) AS UTC_grpMaxSpeedInThisDirection
    FROM TA_VARIOUS AS md -- Max Direction
    LEFT JOIN TA_VARIOUS AS ms -- Max Speed
        ON (md.utc = ms.utc AND ms.sen_id = gustSpeed)
    WHERE md.sen_id = gustDirection
    AND md.utc >= start AND md.utc < stop
    GROUP BY MaxDir_UTC, MaxDirection
) AS msd -- Max Speed & Direction
    ON ( MaxDir_UTC = DATE(sa.utc) AND msd.MaxDirection = dd.value)

WHERE sa.sen_id = SpeedAverage
    AND sa.utc >= start AND sa.utc < stop
GROUP BY UTC_grp, DominantDirection
ORDER BY UTC_grp ASC, DominantDirection;