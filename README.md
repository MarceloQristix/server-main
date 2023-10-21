# server
Code running on the server

# prod server deployment instructions

```
  ssh ubuntu@qristix.com
  cd code/server
  git pull --rebase
  <npm install> (if any new packages are added)
  pm2 ls  (note down what is the last time it restarted and the restart count)
  pm2 restart saas
  wait for a minute
  pm2 ls (check what is the last restart time and restart count - this should be just 1 more than previously noted count)
```

## Pre requisites
1. nodejs 14.x(Install NVM(node version mnagrr

1. mogodb 4.4

1. nginx 1.18.0 +

# Local Setup
1. Clone this repo's main branch
2. In the root folder exec `npm install`
3. Put the below configuration in code repo root level `secrets/credentials.json` 
file and set the values.
```
{
    "rootPassword": "",
    "orgAdminPasswordPrefix": "",
    "sessionSecret" : "",
    "sendgridApiKey": "",
    "dbUrl": "mongodb://localhost:27017/saas",
    "countryStateCityAPIKey" :"",
    "baseUrl" : "http://devqristix.com",
    "activeOrgs": [ //these are the only deployments which will be initialized during local dev
      "demo",
      "qristix"
    ],
    "jwtSecret":"abcdefghij"
}
```
4. Add below entry in `/etc/hosts`
```
#qristix
127.0.0.1       www.devqristix.com
127.0.0.1       devqristix.com
```
5. Put the below
 config in `/etc/nginx/conf.d/default.conf` and reload nginx(For older versions of ubuntu ie < Ubuntu 20.4 Focal Fossa)

config in `/etc/nginx/sites-available/default.conf(20.4 version and above.)
```
server {
    listen 80;

    server_name *.devqristix.com;

    location /api {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # React local development Client
    
    # for local development of react app
    location ^~ /app {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Angular app
     location ^~ /appv2 {
        proxy_pass http://localhost:4200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }


    # for production build of react app 
    location ^~ /app {
        alias {base path}/web-client/build/;
        index index.html;
        try_files $uri $uri/ index.html =404;
    }



}
```

# To dump and restore prod data to local
`mongosh "mongodb+srv://cluster0.gmwcu.mongodb.net/org_3" --username qradmin`

`mongodump "mongodb+srv://cluster0.gmwcu.mongodb.net/org_13" --username qradmin`

# To restore data to staging
`mongorestore --uri "mongodb+srv://staging.4kok7.mongodb.net/" --username qradmin --nsInclude="org_14.*" --drop`
# For UI 
1. Clone client github repo from git@github.com:qristix/web-client.git

# Howto run server (this repo)
For regular server run `npm start`
For express debug `DEBUG=express:* ;cd src && node index.js business_api`
To generate QR Codes `cd src && node index.js exec_once gen-qrcodes {orgShortName}`

# How to provision a new deployment
## Pre req
* config copy
* add deployment name in list of deployments in config/default.json
* generate unique crypto id - go to tools dir. run genOrgUniqueId.js, it will output a code.
in package.json - add type:"module". revert it to normal once script is run
* The above generated code put in 
* admin email id - note password from log (on the server side)
* logos - These needs to be put in website repo - v1/images/logos/ directory
  * on qrcode sticker (250x85-100)
  * for the app (80-200x80)
* Update profile to reflect logo paths
* create assets

## Generate QR Code
Before running the below script update the no.of qrcodes(assets) to be created in
`numQRCodes variable in src/tasks/qrcodes-gen.js`. Once executed, if any changes 
need to drop the generated assets and then re run.

`cd src; node index.js exec_once qrcodes-gen <deployment short name>`

Run the below script to generate qr code stickers. Can be run as many times as needed 
till the look and feel of the qr code stickers is proper.
`cd src; node index.js exec_once gen-qrcodestickers <deployment short name>`

# Reset data for a deployment using mongo commands
## Clear contracts
db.tickets.remove({sType:"pm"})
db.contracts.remove({})
db.assets.update({}, {$unset:{contract:undefined}}, {multi: true})
db.seq_counters.update({prefix:"PMTKT"}, {$set:{seqId:0}})
db.seq_counters.update({prefix:"CN"}, {$set:{seqId:0}})


## To set timezone to Asia/Kolkata (by default it was Etc/UTC)
sudo timedatectl set-timezone Asia/Kolkata

## Configuration for technicianSignature customerSignature sections during ticket closure
```
{
  "id": "technicianSignature",
  "name": "Technician Signature",
  "required": true
},
{
  "id": "customerSignature",
  "name": "Customer Signature",
  "required": true
}
```

## Copy from one collection to another collection in another db
`db.<collection_name>.find().forEach(function(d){ db.getSiblingDB('<new_database>')['<collection_name>'].insert(d); });`
