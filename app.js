const fs = require("fs");
const mysql = require("mysql");
const pm2 = require('pm2');
var WebSocketClient = require('websocket').client;
const Telegraf = require('telegraf');
const config = require("./config");
const db = config['db'];
const botConfig = config['botConfig'];
var wsUri = botConfig['wsUri'];


var stickersArr = [];
var usersArr = [];

const bot = new Telegraf(botConfig['token']);
var pool  = mysql.createPool({
  host: db['host'],
  database: db['dbname'],
  user: db['db_user'],
  password: db['db_pass'],
});

function errorsLog(text){
  // fs.appendFile("logfile.log", text + "\n", function(error){
  //   if(error) throw error;
  // });
}


function getStickers(){
  return new Promise((resolve, reject) => {
   pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
      reject(err);
    }
    let data = [];
    let sql = "SELECT * FROM `stickers`";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
              errorsLog(err);
              reject(err);
          }
          resolve(result);
      });
    });
 });
}


function getUsers(){
  return new Promise((resolve, reject) => {
   pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
      reject(err);
    }
    let data = [];
    let sql = "SELECT * FROM `users`";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
              errorsLog(err);
              reject(err);
          }
          resolve(result);
      });
    });
 });
}


function setStickersArr(stickers){
  let stickersArr_prep = [];
  stickers.forEach((sticker) => {
    stickersArr_prep.push(sticker['sticker_id']);
  });
  return stickersArr_prep;
}


function setUsersArr(users){
  let usersArr_prep = [];
  users.forEach((user) => {
    usersArr_prep.push(user['userId']);
  });
  return usersArr_prep;
}


function getStickersFromDb(itemStickers){
  return new Promise((resolve, reject) => {
   pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
      reject(err);
    }
    let data = [];
    let itemStickersStr = '';
    itemStickers.forEach((itemStick) => {
      itemStickersStr += "'" + itemStick + "', ";
    });
    itemStickersStr = itemStickersStr.substr(0, itemStickersStr.length - 2);

    let sql = "SELECT * FROM `stickersapi` WHERE `sticker_id` IN ("+itemStickersStr+")";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
              errorsLog(err);
              reject(err);
          }
          resolve(result);
      });
    });
 });
}


function getItemFromDb(itemId){
  return new Promise((resolve, reject) => {
   pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
      reject(err);
    }
    let data = [itemId];
    let sql = "SELECT * FROM `checkedItems` WHERE `itemId` = ?";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
              errorsLog(err);
              reject(err);
          }
          resolve(result);
      });
    });
 });
}


function addNewItemToDb(item){
  pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
    }
    let data = [item['ui_id'], item['i_market_name'], item['ui_price']];
    let sql = "INSERT INTO `checkedItems` (`itemId`, `marketName`, `price`) VALUES (?, ?, ?)";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
            errorsLog(err);
          }
      });
    });
}


function updateItemInDb(item){
  pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
    }
    let priceTxt = ''+item['ui_price']+'';

    if(!Number.isInteger(item['ui_price'])){
      priceTxt = priceTxt.substr(0, priceTxt.length-3);
    }
    let data = [priceTxt, item['ui_id']];
    let sql = "UPDATE `checkedItems` SET `price` = ? WHERE `itemId` = ?";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
            errorsLog(err);
          }
      });
    });
}



async function sendInfoToBot(item, itemStickers){
  let itemStr = "\n";

  try{
    let itemsStrArr = await getStickersFromDb(itemStickers);
    let i = 1;
    itemStickers.forEach((itemSticker) => {
      let sticket_name = '';
      for(let k = 0; k < itemsStrArr.length; k++){
        if(itemSticker == itemsStrArr[k]['sticker_id']){
         sticket_name = itemsStrArr[k]['sticker_name'];
         break;
        }
      }
      itemStr += i + ". " + sticket_name + "\n";
      i++;
    });

    let priceTxt = ''+item['ui_price']+'';

    if(!Number.isInteger(item['ui_price'])){
      priceTxt = priceTxt.substr(0, priceTxt.length-3);
    }

    let length = priceTxt.length;
    if(length > 3){
      price = priceTxt.substr(0, length-3) + '.'+ priceTxt.substr(length-3);
    }
    else{
      price = priceTxt
    }

    // send info to chat
    let text = item['i_market_name'] + "\nPrice: " + price + item['ui_currency'] + "\nStickers: " + itemStr + "\nLink: https://market.csgo.com/item/" + item['ui_id']

    usersArr.forEach((userChat) =>{
      try{
       bot.telegram.sendMessage(userChat, text);
      }
      catch(e){
        errorsLog(err);
      }
    });
  }
  catch(e){
    errorsLog(err);
  }
}


async function handleItemFromSocket(item, itemStickers){
  let allowed = true;
  if(item['i_market_name'].indexOf('Сувенирный') != -1){
    allowed = await checkStickersForSouvenirAllowed(itemStickers);
  }
  if(allowed){
    allowed = await checkStickersForSameStickersAllowed(itemStickers);
  }
  if(allowed){
    let itemDb = await getItemFromDb(item['ui_id']);

    let priceTxt = ''+item['ui_price']+'';

    if(!Number.isInteger(item['ui_price'])){
      priceTxt = priceTxt.substr(0, priceTxt.length-3);
    }
    if(itemDb.length == 0){
      addNewItemToDb(item);
      sendInfoToBot(item, itemStickers);
    }
    else if(itemDb[0]['price'] != priceTxt && itemDb[0]['off_item'] == 0){
      updateItemInDb(item);
      sendInfoToBot(item, itemStickers);
    }
    else{
      // sendInfoToBot(item, itemStickers);
    }
  }
}

function getItemSouvenirAllow(stickerId){
  return new Promise((resolve, reject) => {
   pool.getConnection(function(err, connectionDb) {
    if(err) {
      errorsLog(err);
      reject(err);
    }
    let data = [stickerId];
    let sql = "SELECT * FROM `stickers` WHERE `sticker_id` = ?";
      connectionDb.query(sql, data, function (err, result){
      connectionDb.release();
          if (err){
              errorsLog(err);
              reject(err);
          }
          resolve(result);
      });
    });
 });
}


async function checkStickersForSouvenirAllowed(itemStickers){
  let allowed = true;
  for(let i = 0; i < itemStickers.length; i++){
    let itemInfo = await getItemSouvenirAllow(parseInt(itemStickers[i]));
    if(itemInfo.length > 0 && itemInfo[0]['hide_souvenir'] == 1){
      allowed = false;
      break;
    }
  }
  return allowed;
}


async function checkStickersForSameStickersAllowed(itemStickers){
  let allowed = true;
  for(let i = 0; i < itemStickers.length; i++){
    let itemInfo = await getItemSouvenirAllow(parseInt(itemStickers[i]));
    // check same items on gun
    if(itemInfo.length > 0 && itemInfo[0]['same_on_gun'] > 1){
      let count = 0;
      for(let z = 0; z < itemStickers.length; z++){
        if(itemStickers[z] == itemStickers[i]){
          count++;
        }
      }
      if(count < itemInfo[0]['same_on_gun']){
        allowed = false;
        break;
      }
    }
  }
  return allowed;
}


async function handler(connection) {
  // tell socket type of channel
  connection.sendUTF('newitems_go');

  // tell server that we are here
  let timerId = setInterval(() => connection.sendUTF('ping'), 20000);

  connection.on('close', function(message){
    errorsLog(err);
    process.exit(-1);
  });

  connection.on('message', function (message) {
    if(message['utf8Data'] != 'pong'){
      let item = JSON.parse(JSON.parse(message['utf8Data'])['data']);
      // check if there stickers on item
      if (typeof item['stickers'] !== 'undefined') {
        let itemStickers = item['stickers'].split('|');
        for(let i = 0; i < itemStickers.length; i++){
          if(stickersArr.includes(parseInt(itemStickers[i]))){
            handleItemFromSocket(item, itemStickers);
            break;
          }
        }
      }
    }
  });


}


async function updStickers(){
  let stickers = await getStickers();
  stickersArr = setStickersArr(stickers);
}


async function updUsers(){
  let users = await getUsers();
  usersArr = setUsersArr(users);
}

async function main(){
  errorsLog('app is started');
  // get stickers from db
  let stickers = await getStickers();

  // set stickers arr for check them on items
  stickersArr = setStickersArr(stickers);
  let timerIdStickers = setInterval(() => updStickers(), 60000);

  let users = await getUsers();

  usersArr = setUsersArr(users);
  let timerIdUsers = setInterval(() => updUsers(), 60000);

  var client = new WebSocketClient();

  client.on('connect', handler);

  client.connect(wsUri);

}

main();