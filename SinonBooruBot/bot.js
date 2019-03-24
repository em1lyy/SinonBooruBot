/**
 *
 * A bot that uploads images of Sinon / Shino Asada to https://sinon.jagudev.net
 * Copyright (C) 2019 Jonas Jaguar <jonasjaguar@jagudev.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * INVITE: https://discordapp.com/oauth2/authorize?&client_id=548558443624005632&scope=bot&permissions=66624
 *
**/

const Eris = require("eris");
const winston = require("winston");
const pkg = require("./package.json");
const auth = require("./auth.json");
const ftpClient = require("ftp");
const fs = require('fs');
const request = require('request');
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');
const imageminMozjpeg = require('imagemin-mozjpeg');

// Configure logger settings
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json(),
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== "production") {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Initialize FTP Client
var ftp = new ftpClient();

// Initialize Eris object
var bot = new Eris.Client(auth.token,
                          {
                              "defaultImageSize": 512,
                              "autoreconnect": true,
                              "defaultImageFormat": "jpg",
                              "messageLimit": 1024
                          }
);

/**
 * Some functions for logging
**/

function logInfo(message) { // Alter log function
    logger.info(message); // Log message to winston
}

function logError(err) { // Alter error function
    logger.error("Caught exception: " + err.message); // Log exception message and Shard ID...
    logger.info("Stack trace: " + err.stack); // ..and stack trace to console using winston
}

/**
 * Function to prevent the bot from being interrupted.
 * When Ctrl+C is pressed, it first shuts the bot down and doesn't just destroys it.
**/

process.on("SIGINT", function () { // CTRL+C / Kill process event
    logInfo("Shutting down.");
    bot.disconnect();
    ftp.end();
    logger.info("Shut down.");
    process.exit();
});

/**
 * Ready Events
**/

bot.on("ready", () => {    // When the bot is ready
    logger.warn("[MODULECOMMENTS] [AUTH] " + auth.comment);
    logInfo("Checking image download directory...");
    checkDLDir();
    logInfo("Ready event called!"); // Log "Ready!" and some information
    logInfo("User: " + bot.user.username); // User name
    logInfo("Start Timestamp: " + bot.startTime); // Start time as timestamp
    logInfo("Setting information!"); // "Setting information"
    bot.editStatus("online", { // Set status
        "name":"Uploading images. Hopefully.",
        "type":0
    });
    logInfo("Everything set up! I'm now up and running!");
});

ftp.on('ready', function() {
  logInfo("FTP Client Ready.")
});

/**
 * Basically the main functions of the bot.
 * emoji: 📤
**/

function checkDLDir() {
  if (!fs.existsSync("./image_downloads")) {
    logInfo("Download directory doesn't exist, creating it...")
    fs.mkdir("image_downloads", {}, (err) => {
      if (err) {
        logger.error("An error occurred during the creation of the download directory!");
        logger.error("Throwing error...");
        logError(err);
        throw err;
      } else {
        logInfo("Download directory created!");
      }
    });
  } else {
    logInfo("Download directory exists!");
  }
  if (!fs.existsSync("./image_previews")) {
    logInfo("Preview directory doesn't exist, creating it...")
    fs.mkdir("image_previews", {}, (err) => {
      if (err) {
        logger.error("An error occurred during the creation of the preview directory!");
        logger.error("Throwing error...");
        logError(err);
        throw err;
      } else {
        logInfo("Preview directory created!");
      }
    });
  } else {
    logInfo("Preview directory exists!");
  }
}

function download (uri, filename, callback) {
  request.head(uri, function(err, res, body){
    console.log('content-type:', res.headers['content-type']);
    console.log('content-length:', res.headers['content-length']);
    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

async function createPreviewImage (filename, callback) {
  if (filename.endsWith(".png")) {
    await imagemin(["./image_downloads/" + filename], "./image_previews/", {
      plugins: [
        imageminPngquant({
          quality: [0.56, 0.72]
        })
      ]
    }).then((out) => {
      callback();
    });
  } else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    await imagemin(["./image_downloads/" + filename], "./image_previews/", {
      plugins: [
        imageminMozjpeg({
          quality: 70,
        })
      ]
    }).then((out) => {
      callback();
    });
  } else {
    logger.error("Couldn't detect file format, exiting!");
  }
}

function uploadToFTPServer (filename) {
  console.log(filename);
  download ("https://sinon.jagudev.net/database.json", "database.json", () => {
    var imgDatabase = require("./database.json");
    console.log(imgDatabase);
    imgDatabase.imageCount++;
    imgDatabase.posts.unshift(filename);
    fs.writeFile('database.json', JSON.stringify(imgDatabase), 'utf8', () => {
      ftp.ascii((err) => {
        if (err) throw err;
        ftp.cwd("subdomain-sinon", (err, curdir) => {
          if (err) throw err;
          ftp.put('database.json', 'database.json', (err) => {
            if (err) throw err;
            ftp.binary((err) => {
              if (err) throw err;
              ftp.cwd("images/gallery", (err, curdir) => {
                if (err) throw err;
                ftp.put("./image_downloads/" + filename, filename, function(err) {
                  if (err) throw err;
                  ftp.cdup((err) => {
                    if (err) throw err;
                    ftp.cwd("preview", (err, curdir) => {
                      if (err) throw err;
                      ftp.list((err, list) => {
                        if (err) throw err;
                        createPreviewImage(filename, () => {
                          ftp.put("./image_previews/" + filename, filename, function(err) {
                            if (err) throw err;
                            ftp.cdup((err) => {
                              if (err) throw err;
                              ftp.cdup((err) => {
                                if (err) throw err;
                                ftp.cdup((err) => {
                                  if (err) throw err;
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

bot.on("messageReactionAdd", (message, emoji, userID) => {
    if (userID === auth.ownerID && emoji.name === "📤") {
      logInfo("Reaction detected, checking message!");
      bot.getMessage(message.channel.id, message.id).then((messageN) => {
        var embeds = messageN.attachments;
        if (embeds.length != 0) {
          logInfo("All checks passed, uploading image now!");
          logInfo("Upload filename: " + embeds[0].filename);
          download(embeds[0].url, "./image_downloads/" + embeds[0].filename, () => {
            uploadToFTPServer(embeds[0].filename);
          });
        }
      }).catch((reason) => {
        console.log("Upload failed: " + reason);
      });
    }
});

// Connect to ftp
logInfo("Starting FTP Client");
ftp.connect({
  "host": auth.ftpServer,
  "user": auth.user.name,
  "password": auth.user.pass
});

// Get the bot to connect to Discord
logInfo("Starting bot");
bot.connect();
