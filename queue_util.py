from queue import Queue

import discord
from discord import VoiceClient


class PlayerQueue:
    __playerQueue = {}

    def __play_draft(self, voice_client: VoiceClient):
        if voice_client is not None:
            if voice_client.channel.id not in self.__playerQueue:
                return
            if self.__playerQueue[voice_client.channel.id].empty():
                return
            file = self.__playerQueue[voice_client.channel.id].get()

            def after(error):
                if error:
                    print("Last play has an error: ", error)
                self.__play_draft(voice_client)

            voice_client.play(discord.FFmpegPCMAudio(file), after=after)

    def queue_and_play(self, voice_client: VoiceClient, file: str):
        if voice_client.channel.id not in self.__playerQueue:
            self.__playerQueue[voice_client.channel.id] = Queue()
        self.__playerQueue[voice_client.channel.id].put(file)
        if not voice_client.is_playing():
            self.__play_draft(voice_client)
