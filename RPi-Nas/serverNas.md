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
- demarer le Rpi

## 2/ Premieres install

```
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install nginx nodejs npm git
```

## 3/ OpenMediaVault (tres long : 20min)

```
wget -O - https://github.com/OpenMediaVault-Plugin-Developers/installScript/raw/master/install | sudo bash
```

## 4/ Conf NodeJS

```
mkdir /home/alban/www/
cd /home/alban/www/
git clone --depth 1 https://github.com/sctfic/Probe2.git
cd Probe
npm install
sudo npm install -g pm2

sudo chown -R alban:www-data /home/alban/www/Probe
sudo chmod 775 /home/alban/www/Probe
sudo chmod 755 /home/alban/www
sudo chmod 755 /home/alban

sudo mkdir -p /var/log/pm2/Probe
sudo chown -R alban:www-data /var/log/pm2/Probe


pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

## 5/ Conf nginx

```Bash
sudo mv /home/alban/www/Probe/RPi-Nas/Probe.conf /etc/nginx/sites-available/
sudo ln -sn /etc/nginx/sites-available/Probe.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 6/ Tests

```
curl -sI http://probe/favicon.ico | grep 'Content-Type: image/x-icon' && echo '[  OK  ] nginx OK' || echo '[error!] nginx KO'
curl -s http://probe/api | grep 'application/json' && echo '[  OK  ] nodejs OK' || echo '[error!] nodejs KO'
```

## 7/ mise a jour de Probe

```
cd /home/alban/www/Probe
pm2 stop Probe; git fetch && git reset --hard origin/main; sudo chmod -R 755 /home/alban/www/Probe; pm2 restart ecosystem.config.js; pm2 log
pm2 save
pm2 log Probe
```

