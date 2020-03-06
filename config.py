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
# !/usr/bin/env python

from __future__ import print_function

import json
import logging


class Config:
    def __init__(self, raw_data: dict):
        self.TOKEN = raw_data['TOKEN'] if 'TOKEN' in raw_data else ""
        self.admins = raw_data['admins'] if 'admins' in raw_data else []
        self.Debug = raw_data['Debug'] if 'Debug' in raw_data else False

    def to_dict(self) -> dict:
        return {
            "TOKEN": self.TOKEN,
            "admins": self.admins,
            "Debug": self.Debug
        }


class ConfigManager:
    def __init__(self, testing=False):
        self.__logger = logging.getLogger("Config")
        logging.basicConfig(level=logging.INFO)
        self.__logger.info("Loading Config...")
        if testing:
            self.__logger.info("Testing mode detected, using testing config.")
            self.__configRaw = Config({}).to_dict()
        else:
            try:
                with open('./config.json', 'r') as fs:
                    self.__configRaw = json.load(fs)
            except FileNotFoundError:
                self.__logger.error(
                    "Can't load config.json: File not found.")
                self.__logger.info("Generating empty config...")
                self.__configRaw = Config({}).to_dict()
                self.__save_config()
                self.__logger.error("Check your config and try again.")
                exit()
            except json.decoder.JSONDecodeError as e1:
                self.__logger.error(
                    "Can't load config.json: JSON decode error:{0}".format(str(e1.args)))
                self.__logger.error("Check your config format and try again.")
                exit()
        self.__config = Config(self.__configRaw)
        self.__configRaw = self.__config.to_dict()
        self.__save_config()

    def get_config(self) -> Config:
        return self.__config

    def __save_config(self):
        with open('./config.json', 'w') as fs:
            json.dump(self.__configRaw, fs, indent=2)
