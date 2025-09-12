# mise en place d'un RPi3, Probe + Nas

## 1/ faire la carte SD

- utiliser Rasberry Pi Imager v1.9.6
- utilisateur : alban
- OS > Pi OS Lite x64
- Modifier les reglages
  - Activer SSH + cle publique
    ```
    ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQC6Ie7OO9km5aA3N+6g3QBsZinqB6mOwxnGQSZ9z2FtSpb7LL08icovma/G295N/RAALFXgSHr41Amo93mzuD60IIHo938Q5zw+Yzh8OkJMmXFHs6768TTOUrXHTokn5mIeThDT2AUAUVaGyFoXwin5k5yOrmEzVo9IObLk35ZGt9G3/tatG8qJ36qMvNcgQbU1AOkbgL7Md4gQFrBqGss5njTZGI5B76vtLDxkfMfjlP1AehtFyyrSpx+8k4bMsEEYJi3gXEtXTHElXnq8UMNV7tU2IG88esg87mTNSG7lMY1RMnwaTZMYbKF9LwqbecaQ17O/kWNbw2FQMOfEnkk2IcwkIuzbshnA7QMI3W+3edttBwy8sqCKNmcb2mxSLOcIUy5gSMMYMVJ//gzniQEKFBLjcMqJIjcymVWuORUvc4heKDneuR6cUxIhUUxylurB3h0AhSGfbFYMkDkoiAkuxzo2zXf3GJLW9otdweAymosZeMmDPIL6+5EZuLTFVy1WiFmbe+WbI6SLQKkiJay+hJZ3WY2v14JSmt1YAwB0LSZXpipvXkEU1Oi/1veW2pQvMs5lZ6+nRXuO5KoDd5IYS8G7Z5j6ydHt5OO/mGoiFGKXZfqKvCzY+T06n9omPCXuoS9Jbjlp4TA1q+TrJFpLC48q6+dCIoT6QOK4E50/6w== alban@xps13
    ```
- deparer le Rpi

## 2/ Premieres install

```
apt-get update
apt-get nginx nodejs npm git
```

OpenMediaVault (tres long : 20min)

```
wget -O - https://github.com/OpenMediaVault-Plugin-Developers/installScript/raw/master/install | sudo bash
```

## 3/ Conf NodeJS

```
sudo chown -R alban:www-data /home/alban/www/Probe2
sudo chmod 775 /home/alban/www/Probe2
sudo chmod 755 /home/alban/www
sudo chmod 755 /home/alban

cd /home/alban/www/Probe2
git clone https://github.com/sctfic/Probe2.git

npm install

pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

## 4/ Conf nginx

```Powershell
scp C:\chemin\vers\Probe.conf alban@rpi3:/home/alban/
```

```Bash
sudo mv /home/alban/Probe.conf /etc/nginx/sites-available/
```

```
ssh alban@rpi3 "sudo ln -s /etc/nginx/sites-available/Probe.conf /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl restart nginx && curl -sI http://probe/favicon.ico | grep 'Content-Type: image/x-icon' && curl -s http://probe/api | grep 'application/json'"
```

## 5/ Conf OpenMediaVault



server {
    # Configuration pour HTTP avec redirection vers HTTPS
    listen 80;
    server_name probe probe.lan;
    root /home/alban/www/Probe2/public;

    # Logs
    access_log /var/log/nginx/probe.access.log;
    error_log /var/log/nginx/probe.error.log warn;

    # Configuration pour l'API
    location /api/ {
        proxy_pass http://localhost:2222;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts ajustes
        proxy_connect_timeout 12s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Gestion des CORS
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
    }

    # Fichiers statiques
    location / {
    #    root /home/alban/www/Probe2/public;
        try_files $uri $uri/ @nodejs;

        # Cache pour les fichiers statiques
        location ~* \.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1d;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        # Cache pour le code
        location ~* \.(html,js,css)$ {
            expires 1h;
            add_header Cache-Control "public, no-cache";
        }
    }

    # Fallback vers Node.js pour les routes SPA
    location @nodejs {
        proxy_pass http://localhost:2222;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Securite
    server_tokens off;
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

}
