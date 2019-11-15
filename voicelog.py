#  VoiceLog by jimchen5209
#  Copyright (C) 2019-2019
#
#  This program is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Affero General Public License as published
#  by the Free Software Foundation, either version 3 of the License, or
#  any later version.
#
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Affero General Public License for more details.
#
#  You should have received a copy of the GNU Affero General Public License
#  along with this program.  If not, see <https://www.gnu.org/licenses/>.

import datetime
import io
import logging
import os
import sys
import time

import discord
from discord.ext import commands

from config import Config
from data import Data
from status.status import Status

# Setup logging
if not os.path.isdir("./logs"):
    os.mkdir("./logs")
log_path = "./logs/" + time.strftime("%Y-%m-%d-%H-%M-%S").replace("'", "")
log_format = "[%(asctime)s][%(levelname)s][%(name)s] %(message)s"
logging.root.name = "VoiceLog"
logger = logging.getLogger()
logging.basicConfig(format=log_format, level=logging.INFO)
handler = logging.FileHandler(filename=log_path + '.log', encoding='utf-8', mode='w')
handler.setFormatter(logging.Formatter(log_format))
logger.addHandler(handler)

# Setup Config
if len(sys.argv) != 1:
    if sys.argv[1] == 'test':
        config = Config(True)
    else:
        raise SyntaxError("Invalid command syntax: {0}".format(sys.argv[1]))
else:
    config = Config()

# Load Language
fs = None
try:
    fs = io.open("./langs/list.py", "r", encoding='utf8')
except Exception as e1:
    logger.error("Error when loading list.py: {0}".format(str(e1.args)))
    exit()
lang_list = eval(fs.read())
fs.close()
lang = {}
for i in lang_list:
    with io.open(lang_list[i]["file"], "r", encoding='utf8') as fs:
        lang[i] = {}
        lang[i]["display"] = eval(fs.read())
        lang[i]["display_name"] = lang_list[i]["display_name"]

discord_client = commands.Bot(command_prefix='$')
voice_log_data = Data()


@discord_client.event
async def on_ready():
    logger.info('Logged in as {0} {1}'.format(discord_client.user.name, discord_client.user.id))


@discord_client.event
async def on_voice_state_update(member, before, after):
    data = voice_log_data.getData(str(member.guild.id))
    if data.channel == "-1":
        return
    channel = discord_client.get_channel(int(data.channel))
    if before.channel is None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x417505),
                              description=lang[data.lang]["display"]['voice_log']["joined"].format(after.channel.name),
                              timestamp=datetime.datetime.utcnow())
        embed.set_author(name="𝅺", icon_url=member.avatar_url)  # name=member.display_name,
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        await channel.send(embed=embed)
    elif after.channel is None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x810011),
                              description=lang[data.lang]["display"]['voice_log']["left"].format(before.channel.name),
                              timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        await channel.send(embed=embed)
    elif before.channel == after.channel:
        pass
    else:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x9f6d16),
                              description="{0} ▶️ {1}".format(
                                  before.channel.name, after.channel.name), timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        await channel.send(embed=embed)


@discord_client.command()
async def setvlog(ctx, *args):
    if ctx.guild is None:
        await ctx.send('This function is not available for private chat.')
        return
    data = voice_log_data.getData(str(ctx.guild.id))
    if len(args) == 0:
        if data.channel == str(ctx.channel.id):
            await ctx.send(lang[data.lang]["display"]["config"]["exist"])
        else:
            voice_log_data.setData(str(ctx.guild.id), str(ctx.channel.id), data.lang)
            await ctx.send(lang[data.lang]["display"]["config"]["success"])
    else:
        new_lang = args[0]
        if new_lang not in lang:
            await ctx.send('Language not exist, will not change your language.')
            new_lang = data.lang
        if data.channel == str(ctx.channel.id) and data.lang == new_lang:
            await ctx.send(lang[data.lang]["display"]["config"]["exist"])
        else:
            if data.channel == str(ctx.channel.id):
                voice_log_data.setLang(str(ctx.guild.id), new_lang)
                await ctx.send(
                    lang[new_lang]["display"]["config"]["langsuccess"].format(lang[new_lang]["display_name"]))
                await ctx.send(lang[new_lang]["display"]["config"]["exist"])
            else:
                voice_log_data.setData(str(ctx.guild.id),
                                       str(ctx.channel.id), new_lang)
                await ctx.send(lang[new_lang]["display"]["config"]["success"])


@discord_client.command()
async def setlang(ctx, *args):
    if ctx.guild is None:
        await ctx.send('This function is not avaliable for private chat.')
        return
    data = voice_log_data.getData(str(ctx.guild.id))
    if len(args) == 0:
        await ctx.send(lang[data.lang]["display"]["config"]["notenoughargument"])
        exit()
    newLang = args[0]
    if newLang not in lang:
        await ctx.send('Language not exist.')
    else:
        if newLang == data.lang:
            await ctx.send(lang[data.lang]["display"]["config"]["langexist"].format(lang[data.lang]["display_name"]))
        else:
            voice_log_data.setLang(str(ctx.guild.id), newLang)
            await ctx.send(lang[newLang]["display"]["config"]["langsuccess"].format(lang[newLang]["display_name"]))


async def on_message(message):
    discord_log = ""
    try:
        discord_log = discord_log + ' ' + message.author.display_name + '@' + message.author.name + \
                      ' in ' + message.channel.name + \
                      " (" + str(message.channel.id) + ') : ' + message.content
    except AttributeError:
        discord_log = discord_log + ' ' + message.author.display_name + \
                      '@' + message.author.name + ' : ' + message.content
    logger.info(discord_log)


discord_client.add_listener(on_message, 'on_message')

if len(sys.argv) != 1:
    if sys.argv[1] == 'test':
        logger.info('There is no syntax error,exiting...')
        exit()
    else:
        raise SyntaxError("Invalid command syntax: {0}".format(sys.argv[1]))

logger.info("Bot has started")
logger.info("Listening ...")
status = Status("VoiceLog")
status.set_status()
discord_client.run(config.TOKEN)
