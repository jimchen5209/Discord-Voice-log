import asyncio
import io
import json
import logging
import os
import sys
import time
import datetime
import discord
from discord.ext import commands

from config import Config
from data import Data

#Setup logging
if os.path.isdir("./logs") == False:
    os.mkdir("./logs")
logpath = "./logs/"+time.strftime("%Y-%m-%d-%H-%M-%S").replace("'", "")
logformat = "[%(asctime)s][%(levelname)s][%(name)s] %(message)s"
logging.root.name = "VoiceLog"
logger = logging.getLogger()
logging.basicConfig(format=logformat,level=logging.INFO)
handler = logging.FileHandler(filename=logpath+'.log', encoding='utf-8', mode='w')
handler.setFormatter(logging.Formatter(logformat))
logger.addHandler(handler)

#Setup Config
if len(sys.argv) != 1:
    if sys.argv[1] == 'test':
        config = Config(True)
    else:
        raise SyntaxError("Invaild command santax: {0}".format(sys.argv[1]))
else:
    config = Config()

#Load Language
try:
    fs = io.open("./langs/list.py", "r", encoding='utf8')
except Exception as e1:
    logger.error("Errored when loading list.py: {0}".format(str(e1.args)))
    exit()
langlist = eval(fs.read())
fs.close()
lang = {}
for i in langlist:
    with io.open(langlist[i]["file"], "r", encoding='utf8') as fs:
        lang[i] = {}
        lang[i]["display"] = eval(fs.read())
        lang[i]["display_name"] = langlist[i]["display_name"]

discord_client = commands.Bot(command_prefix='$')
vlogdata = Data()

@discord_client.event
async def on_ready():
    logger.info('Logged in as {0} {1}'.format(discord_client.user.name, discord_client.user.id))

@discord_client.event
async def on_voice_state_update(member, before, after):
    data = vlogdata.getData(str(member.guild.id))
    if data.channel == "-1":
        return
    channel = discord_client.get_channel(int(data.channel))
    if before.channel == None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x417505), 
        description=lang[data.lang]["display"]['voice_log']["joined"].format(after.channel.name), timestamp=datetime.datetime.utcnow())
        embed.set_author(name="𝅺", icon_url=member.avatar_url) #name=member.display_name, 
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        await channel.send(embed=embed)
    elif after.channel == None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x810011), 
        description=lang[data.lang]["display"]['voice_log']["left"].format(before.channel.name), timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        await channel.send(embed=embed)
    elif before.channel == after.channel:
        pass
    else:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x9f6d16), description="{0} ▶️ {1}".format(
            before.channel.name, after.channel.name), timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        await channel.send(embed=embed)
        
@discord_client.command()
async def setvlog(ctx, *args):
    if ctx.guild == None:
        await ctx.send('This function is not avaliable for private chat.')
        return
    data = vlogdata.getData(str(ctx.guild.id))
    if len(args) == 0:
        if data.channel == str(ctx.channel.id):
            await ctx.send(lang[data.lang]["display"]["config"]["exist"])
        else:
            vlogdata.setData(str(ctx.guild.id), str(ctx.channel.id), data.lang)
            await ctx.send(lang[data.lang]["display"]["config"]["success"])
    else:
        newLang = args[0]
        if newLang not in lang:
            await ctx.send('Language not exist, will not change your language.')
            newLang = data.lang
        if data.channel == str(ctx.channel.id) and data.lang == newLang:
            await ctx.send(lang[data.lang]["display"]["config"]["exist"])
        else:
            if data.channel == str(ctx.channel.id):
                vlogdata.setLang(str(ctx.guild.id), newLang)
                await ctx.send(lang[newLang]["display"]["config"]["langsuccess"].format(lang[newLang]["display_name"]))
                await ctx.send(lang[newLang]["display"]["config"]["exist"])
            else:
                vlogdata.setData(str(ctx.guild.id),
                                 str(ctx.channel.id), newLang)
                await ctx.send(lang[newLang]["display"]["config"]["success"])

@discord_client.command()
async def setlang(ctx, *args):
    if ctx.guild == None:
        await ctx.send('This function is not avaliable for private chat.')
        return
    data = vlogdata.getData(str(ctx.guild.id))
    if len(args) == 0:
        await ctx.send(lang[data.lang]["display"]["config"]["notenoughargument"])
        exit
    newLang = args[0]
    if newLang not in lang:
        await ctx.send('Language not exist.')
    else:
        if newLang == data.lang:
            await ctx.send(lang[data.lang]["display"]["config"]["langexist"].format(lang[data.lang]["display_name"]))
        else:
            vlogdata.setLang(str(ctx.guild.id), newLang)
            await ctx.send(lang[newLang]["display"]["config"]["langsuccess"].format(lang[newLang]["display_name"]))

async def on_message(message):
    dislog = ""
    try:
        dislog = dislog + ' ' + message.author.display_name + '@' + message.author.name + \
            ' in '+message.channel.name + \
            " ("+str(message.channel.id)+') : ' + message.content
    except AttributeError:
        dislog = dislog + ' ' + message.author.display_name + \
            '@' + message.author.name+' : ' + message.content
    logger.info(dislog)

discord_client.add_listener(on_message, 'on_message')

if len(sys.argv) != 1:
    if sys.argv[1] == 'test':
        logger.info('There is no santax error,exiting...')
        exit()
    else:
        raise SyntaxError("Invaild command santax: {0}".format(sys.argv[1]))

logger.info("Bot has started")
logger.info("Listening ...")

discord_client.run(config.TOKEN)
