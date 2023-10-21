// Refer : https://stackoverflow.com/questions/6376436/mongodb-drop-every-database
mongo --quiet --eval 'db.getMongo().getDBNames().forEach(function(i){db.getSiblingDB(i).dropDatabase()})'
