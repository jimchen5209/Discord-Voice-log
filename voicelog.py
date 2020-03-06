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
from queue_util import PlayerQueue
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
if not os.path.isdir("langs"):
    logger.error("Directory langs/ not found. Try re-pulling source code.")
    exit()
if not os.path.isfile("langs/list.json"):
    logger.error("Directory langs/list.json not found. Try re-pulling source code.")
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
queue = PlayerQueue()
tts_url = 'https://translate.google.com.tw/translate_tts?ie=UTF-8&q="{0}"&tl={1}&client=tw-ob'

if not os.path.isdir("./assets"):
    os.mkdir("./assets")


@discord_client.event
async def on_ready():
    logger.info('Logged in as {0} {1}'.format(discord_client.user.name, discord_client.user.id))


@discord_client.event
async def on_voice_state_update(member, before, after):
    await auto_leave_channel(before, after)
    data = voice_log_data.getData(str(member.guild.id))

    voice = member.guild.voice_client
    tts = {}
    if os.path.isfile("assets/{0}.json".format(str(member.id))):
        with io.open("assets/{0}.json".format(str(member.id))) as tmp:
            tts = json.load(tmp)
        if 'lang' not in tts:
            tts = {}
    voice_file = ""
    embed = None
    if before.channel is None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x417505),
                              description=lang[data.lang]["display"]['voice_log']["joined"].format(after.channel.name),
                              timestamp=datetime.datetime.utcnow())
        embed.set_author(name="𝅺", icon_url=member.avatar_url)  # name=member.display_name,
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        if voice is not None:
            if after.channel.id == voice.channel.id:
                voice_file = tts_url.format(tts['join'], tts['lang']) if 'join' in tts else \
                    "assets/{0}_join.wav".format(str(member.id)) if os.path.isfile("assets/{0}_join.wav".format(
                        str(member.id))) else ""
    elif after.channel is None:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x810011),
                              description=lang[data.lang]["display"]['voice_log']["left"].format(before.channel.name),
                              timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        if voice is not None:
            if before.channel.id == voice.channel.id:
                voice_file = tts_url.format(tts['left'],
                                            tts['lang']) if 'left' in tts else "assets/{0}_left.wav".format(
                    str(member.id)) \
                    if os.path.isfile("assets/{0}_left.wav".format(str(member.id))) else \
                    ""
    elif before.channel == after.channel:
        pass
    else:
        embed = discord.Embed(title=member.display_name, colour=discord.Colour(0x9f6d16),
                              description="{0} ▶️ {1}".format(
                                  before.channel.name, after.channel.name), timestamp=datetime.datetime.utcnow())
        # name=member.display_name,
        embed.set_author(name="𝅺", icon_url=member.avatar_url)
        # embed.set_footer(text="VoiceLog", icon_url=member.avatar_url)
        if voice is not None:
            if before.channel.id == voice.channel.id:
                voice_file = tts_url.format(tts['switched_out'], tts[
                    'lang']) if 'switched_out' in tts else "assets/{0}_switched_out.wav".format(str(member.id)) \
                    if os.path.isfile("assets/{0}_switched_out.wav".format(str(member.id))) else \
                    ""
            if after.channel.id == voice.channel.id:
                voice_file = tts_url.format(tts['switched_in'], tts[
                    'lang']) if 'switched_in' in tts else "assets/{0}_switched_in.wav".format(str(member.id)) \
                    if os.path.isfile("assets/{0}_switched_in.wav".format(str(member.id))) else \
                    ""
    if data.channel != "-1" and embed is not None:
        channel = discord_client.get_channel(int(data.channel))
        await channel.send(embed=embed)
    if voice_file != "" and voice is not None:
        queue.queue_and_play(voice, voice_file.replace(' ', '%20'))


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
    if ctx.author.guild_permissions.manage_messages or (ctx.author.id in config.admins):
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
    else:
        await ctx.send("Permission denied")


@discord_client.command()
async def setlang(ctx, *args):
    if ctx.guild is None:
        await ctx.send('This function is not avaliable for private chat.')
        return
    if ctx.author.guild_permissions.manage_messages or (ctx.author.id in config.admins):
        data = voice_log_data.getData(str(ctx.guild.id))
        if len(args) == 0:
            await ctx.send(lang[data.lang]["display"]["config"]["notenoughargument"])
            exit()
        newLang = args[0]
        if newLang not in lang:
            await ctx.send('Language not exist.')
        else:
            if newLang == data.lang:
                await ctx.send(
                    lang[data.lang]["display"]["config"]["langexist"].format(lang[data.lang]["display_name"]))
            else:
                voice_log_data.setLang(str(ctx.guild.id), newLang)
                await ctx.send(lang[newLang]["display"]["config"]["langsuccess"].format(lang[newLang]["display_name"]))
    else:
        await ctx.send("Permission denied")


# noinspection PyUnusedLocal,PyTypeChecker
@discord_client.command()
async def join(ctx, *args):
    if ctx.guild is None:
        await ctx.send('This function is not avaliable for private chat.')
        return
    if ctx.author.guild_permissions.manage_messages or (ctx.author.id in config.admins):
        voice = ctx.author.voice.channel
        if voice is None:
            await ctx.send("You are not even in a voice channel")
        else:
            if ctx.guild.voice_client is None:
                await voice.connect()
                voice_log_data.setLastVoiceChannel(str(ctx.guild.id), "")
                voice_file = tts_url.format("VoiceLog TTS is ready.", "en-GB")
                queue.queue_and_play(ctx.guild.voice_client, voice_file.replace(' ', '%20'))
            else:
                if ctx.guild.voice_client.channel == voice:
                    await ctx.send("Already connected")
                else:
                    await ctx.guild.voice_client.move_to(voice)
                    voice_file = tts_url.format("VoiceLog TTS is moved to your channel.", "en-GB")
                    queue.queue_and_play(ctx.guild.voice_client, voice_file.replace(' ', '%20'))
    else:
        await ctx.send("Permission denied")
    return


@discord_client.command()
async def leave(ctx):
    if ctx.guild is None:
        await ctx.send('This bot is not available for private chat.')
        return
    if ctx.author.guild_permissions.manage_messages or (ctx.author.id in config.admins):
        voice = ctx.guild.voice_client
        if voice is not None:
            await voice.disconnect()
    else:
        await ctx.send("Permission denied")
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
