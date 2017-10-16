import sys
import time
import urllib
import urllib.request
from urllib.request import Request, urlopen
import os
import io
import asyncio
import discord
import logging

if os.path.isdir("./logs") == False:
    os.mkdir("./logs")
logpath = "./logs/"+time.strftime("%Y-%m-%d-%H-%M-%S").replace("'","")
logger = logging.getLogger('discord')
logging.basicConfig(level=logging.INFO)
handler = logging.FileHandler(filename=logpath+'-discord.log', encoding='utf-8', mode='w')
handler.setFormatter(logging.Formatter('%(asctime)s:%(levelname)s:%(name)s: %(message)s'))
logger.addHandler(handler)
try:
    fs = open("./config.py","r")
except:
    tp, val, tb = sys.exc_info()
    print("Errored when loading config.py:"+str(val).split(',')[0].replace('(','').replace("'",""))
    programPause = input("Press any key to stop...\n")
    exit()
config = eval(fs.read())
fs.close()
discord_client = discord.Client()
discord_token = config["TOKEN"]
Debug = config['Debug']
try:
    fs = open("./langs/list.py","r")
except:
    tp, val, tb = sys.exc_info()
    print("Errored when loading list.py:"+str(val).split(',')[0].replace('(','').replace("'",""))
    programPause = input("Press any key to stop...\n")
    exit()
langlist = eval(fs.read())
fs.close()
lang = {}
for i in langlist:
    fs = open(langlist[i]["file"],"r")
    lang[i]={}
    lang[i]["display"] = eval(fs.read())
    lang[i]["display_name"]=langlist[i]["display_name"]
    fs.close()

vlogdata = {}
def read_voice_log_data():
    global vlogdata
    clog('[Info] Reading voice log data...')
    if os.path.isfile("./vlogdata.json") == False:
        fs = open("./vlogdata.json","w")
        fs.write("{}")
        fs.close
    fs = open("./vlogdata.json","r")
    vlogdata = eval(fs.read())
    fs.close
    clog('... Done.')
    return

def write_voice_log_data(data):
    clog("[Info] Writing voice log data...")
    fs = open("./vlogdata.json","w")
    fs.write(str(data))
    fs.close
    return

@discord_client.event
async def on_ready():
    print('Logged in as {0} {1}'.format(discord_client.user.name,discord_client.user.id))
    print('------')


@discord_client.event
async def on_voice_state_update(before,after):
    try:
        cur = vlogdata[after.server.id]
    except:
        return
    serlang = cur['lang']
    if before.voice.voice_channel == None:
        msg = lang[serlang]["display"]['voice_log']["joined"].format("`" + after.display_name + "`","`" + str(after.voice.voice_channel)+ "`")
        print(msg)
        await discord_client.send_message(discord.Object(id=cur['channel']),msg)
    elif after.voice.voice_channel == None:
        msg = lang[serlang]["display"]['voice_log']["left"].format("`" + after.display_name + "`","`" + str(before.voice.voice_channel) + "`")
        print(msg)
        await discord_client.send_message(discord.Object(id=cur['channel']),msg)
    elif before.voice.voice_channel == after.voice.voice_channel:
        time.sleep(0)
    else:
        msg = lang[serlang]["display"]['voice_log']["changed"].format("`" + after.display_name + "`","`" + str(before.voice.voice_channel) + "`","`" +str(after.voice.voice_channel) +"`")
        print(msg)
        await discord_client.send_message(discord.Object(id=cur['channel']),msg)
        

@discord_client.event
async def on_message(message):
    global vlogdata
    dislog = "[Discord]["+time.strftime("%Y/%m/%d-%H:%M:%S").replace("'","")+"][Info]"
    try:
        dislog = dislog + ' ' + message.author.display_name + '@' + message.author.name+' in '+message.channel.name +" ("+message.channel.id+') : '+ message.content
    except TypeError:
        dislog = dislog + ' ' + message.author.display_name + '@' + message.author.name+' : '+ message.content
    print(dislog)
    if message.content.startswith('!setvlog'):
        cmd = message.content.split()
        if message.server == None:
            await discord_client.send_message(message.channel, 'This function is not avaliable for private chat.')
            return
        try:
            subcmd = cmd[1]
        except:
            serverid = message.server.id
            try:
                cur = vlogdata[serverid]
            except:
                vlogdata[serverid] = {"channel":message.channel.id,"lang":"en_US"}
            else:
                if message.channel.id == vlogdata[serverid]["channel"]:
                    await discord_client.send_message(message.channel, lang[vlogdata[serverid]["lang"]]["display"]["config"]["exist"])
                    return
                vlogdata[serverid]["channel"] = message.channel.id
            write_voice_log_data(vlogdata)
            await discord_client.send_message(message.channel,lang[vlogdata[serverid]["lang"]]["display"]["config"]["success"])
            return
        else:
            serverid = message.server.id
            try:
                cur = vlogdata[serverid]
            except:
                try:
                    tmp = lang[subcmd]
                except:
                    await discord_client.send_message(message.channel, "Language not exist,using en_US instead.")
                    vlogdata[serverid] = {"channel":message.channel.id,"lang":'en_US'}
                else:
                    vlogdata[serverid] = {"channel":message.channel.id,"lang":subcmd}
            else:
                if message.channel.id == vlogdata[serverid]["channel"]:
                    await discord_client.send_message(message.channel, lang[vlogdata[serverid]["lang"]]["display"]["config"]["exist"])
                    if subcmd != vlogdata[serverid]["lang"]:
                        try:
                            tmp = lang[subcmd]
                        except:
                            await discord_client.send_message(message.channel, "Language not exist.")
                        else:
                            vlogdata[serverid]["lang"] = subcmd
                            write_voice_log_data(vlogdata)
                            await discord_client.send_message(message.channel, \
                            lang[vlogdata[serverid]["lang"]]["display"]["config"]["langsuccess"].format(lang[vlogdata[serverid]["lang"]]["display_name"]))
                    return
                vlogdata[serverid]["channel"] = message.channel.id
                if subcmd != vlogdata[serverid]["lang"]:
                    try:
                        tmp = lang[subcmd]
                    except:
                        await discord_client.send_message(message.channel, "Language not exist.")
                    else:
                        vlogdata[serverid]["lang"] = subcmd
                        await discord_client.send_message(message.channel, \
                        lang[vlogdata[serverid]["lang"]]["display"]["config"]["langsuccess"].format(lang[vlogdata[serverid]["lang"]]["display_name"]))
            write_voice_log_data(vlogdata)
            await discord_client.send_message(message.channel,lang[vlogdata[serverid]["lang"]]["display"]["config"]["success"])
            return
    if message.content.startswith('!setlang'):
        cmd = message.content.split()
        if message.server == None:
            await discord_client.send_message(message.channel, 'This function is not avaliable for private chat.')
            return
        try:
            subcmd = cmd[1]
        except:
            await discord_client.send_message(message.channel, 'Not enough argument.')
        else:
            serverid = message.server.id
            try:
                cur = vlogdata[serverid]
            except:
                await discord_client.send_message(message.channel, 'Please set the log server first.')
            else:
                if subcmd != vlogdata[serverid]["lang"]:
                    try:
                        tmp = lang[subcmd]
                    except:
                        await discord_client.send_message(message.channel, "Language not exist.")
                    else:
                        vlogdata[serverid]["lang"] = subcmd
                        write_voice_log_data(vlogdata)
                        await discord_client.send_message(message.channel, \
                        lang[vlogdata[serverid]["lang"]]["display"]["config"]["langsuccess"].format(lang[vlogdata[serverid]["lang"]]["display_name"]))
                else:
                    await discord_client.send_message(message.channel, \
                    lang[vlogdata[serverid]["lang"]]["display"]["config"]["langexist"].format(lang[vlogdata[serverid]["lang"]]["display_name"]))
        return


def clog(text):
    print(text)
    log(text)
    return

def log(text):
    if text[0:7] == "[Debug]":
        if Debug == True:
            logger= io.open(logpath+"-debug.log","a",encoding='utf8')
            logger.write("["+time.strftime("%Y/%m/%d-%H:%M:%S").replace("'","")+"]"+text+"\n")
            logger.close()
        return
    logger= io.open(logpath+".log","a",encoding='utf8')
    logger.write(text+"\n")
    logger.close()
    return

log("[Logger] If you don't see this file currectly,turn the viewing encode to UTF-8.")
log("[Debug][Logger] If you don't see this file currectly,turn the viewing encode to UTF-8.")
log("[Debug] Bot's TOKEN is "+discord_token)
read_voice_log_data()
clog("["+time.strftime("%Y/%m/%d-%H:%M:%S").replace("'","")+"][Info] Bot has started")
clog("["+time.strftime("%Y/%m/%d-%H:%M:%S").replace("'","")+"][Info] Listening ...")

discord_client.run(discord_token)