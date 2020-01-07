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
import json
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
lang_list = {}
if not os.path.isdir("lang"):
    logger.error("Directory lang/ not found. Try re-pulling source code.")
    exit()
if not os.path.isfile("lang/list.json"):
    logger.error("Directory lang/list.json not found. Try re-pulling source code.")
    exit()
try:
    with io.open("langs/list.json", "r", encoding='utf8') as fs:
        lang_list = json.load(fs)
except json.decoder.JSONDecodeError as e1:
    logger.error("Error when loading lang/list.json: JSON decode error:{0}".format(str(e1.args)))
    exit()

lang = {}
for i in lang_list:
    try:
        with io.open(lang_list[i]["file"], "r", encoding='utf8') as fs:
            lang[i] = {}
            lang[i]["display"] = json.load(fs)
            lang[i]["display_name"] = lang_list[i]["display_name"]
    except json.decoder.JSONDecodeError as e1:
        logger.error("Error when loading {0}: JSON decode error:{1}".format(lang_list[i]["file"], str(e1.args)))
        exit()

discord_client = commands.Bot(command_prefix='$')
voice_log_data = Data()


@discord_client.event
async def on_ready():
    logger.info('Logged in as {0} {1}'.format(discord_client.user.name, discord_client.user.id))


@discord_client.event
async def on_voice_state_update(member, before, after):
    await auto_leave_channel(before, after)
    tts_url = 'https://translate.google.com.tw/translate_tts?ie=UTF-8&q="{0}"&tl={1}&client=tw-ob'
    data = voice_log_data.getData(str(member.guild.id))

    voice = member.guild.voice_client
    voice_text = ""
    if data.channel == "-1":
        return
    channel = discord_client.get_channel(int(data.channel))
    if before.channel is None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x417505),
                              description=lang[data.lang]["display"]['voice_log']["joined"].format(after.channel.name),
                              timestamp=datetime.datetime.utcnow())
        embed.set_author(name="𝅺", icon_url=member.avatar_url)  # name=member.display_name,
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        if after.channel.id == voice.channel.id:
            voice_text = lang[data.lang]["display"]['voice_log']["joined_voice"].format(member.display_name,
                                                                                        after.channel.name)
        await channel.send(embed=embed)
    elif after.channel is None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x810011),
                              description=lang[data.lang]["display"]['voice_log']["left"].format(before.channel.name),
                              timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        if before.channel.id == voice.channel.id:
            voice_text = lang[data.lang]["display"]['voice_log']["left_voice"].format(member.display_name,
                                                                                      before.channel.name)
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
        if before.channel.id == voice.channel.id:
            voice_text = lang[data.lang]["display"]['voice_log']["move_left_voice"].format(member.display_name,
                                                                                           after.channel.name)
        if after.channel.id == voice.channel.id:
            voice_text = lang[data.lang]["display"]['voice_log']["move_join_voice"].format(member.display_name,
                                                                                           before.channel.name)
        await channel.send(embed=embed)
    if voice_text != "" and voice is not None:
        while voice.is_playing():
            pass
        voice.play(discord.FFmpegPCMAudio(tts_url.format(voice_text, data.lang).replace(" ", "%20")))


async def auto_leave_channel(before, after):
    voice_state = after
    if voice_state.channel is None:
        voice_state = before
        if voice_state.channel is None:
            return
    server = voice_state.channel.guild
    voice = server.voice_client
    if before.channel is not None and after.channel is not None:
        if voice is not None:
            if before.channel.id == voice.channel.id:
                voice_state = before
            elif after.channel.id == voice.channel.id:
                voice_state = after
        elif voice_log_data.getData(str(server.id)).lastVoiceChannel != "":
            if voice_log_data.getData(str(server.id)).lastVoiceChannel == str(before.channel.id):
                voice_state = before
            elif voice_log_data.getData(str(server.id)).lastVoiceChannel == str(after.channel.id):
                voice_state = after
    no_user = True
    for member in voice_state.channel.members:
        if not member.bot:
            no_user = False
            break
    if no_user:
        if voice is not None:
            if voice_state.channel.id == voice.channel.id:
                voice_log_data.setLastVoiceChannel(str(server.id), str(voice_state.channel.id))
                await voice.disconnect()
    else:
        if voice is None:
            if voice_log_data.getData(str(server.id)).lastVoiceChannel == str(voice_state.channel.id):
                new_vc = discord_client.get_channel(voice_state.channel.id)
                await new_vc.connect()
                voice_log_data.setLastVoiceChannel(str(server.id), "")


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


@discord_client.command()
async def join(ctx, *args):
    if ctx.guild is None:
        await ctx.send('This function is not avaliable for private chat.')
        return
    voice = ctx.author.voice.channel
    if voice is None:
        await ctx.send("You are not even in a voice channel")
    else:
        if ctx.guild.voice_client is None:
            await voice.connect()
            voice_log_data.setLastVoiceChannel(str(ctx.guild.id), "")
        else:
            if ctx.guild.voice_client.channel == voice:
                await ctx.send("Already connected")
            else:
                await ctx.guild.voice_client.move_to(voice)


@discord_client.command()
async def leave(ctx):
    if ctx.guild is None:
        await ctx.send('This bot is not available for private chat.')
        return
    voice = ctx.guild.voice_client
    if voice is not None:
        await voice.disconnect()
    return


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
