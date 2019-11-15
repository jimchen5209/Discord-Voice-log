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

import json
import logging


class Config:
    def __init__(self, testing=False):
        self.__logger = logging.getLogger("Config")
        logging.basicConfig(
            format="[%(asctime)s][%(levelname)s][%(name)s] %(message)s", level=logging.INFO)
        self.__logger.info("Loading Config...")
        if testing:
            self.__logger.info("Testing mode detected, using testing config.")
            self.__config_raw = {
                "TOKEN": "",
                "Debug": False
            }
        else:
            try:
                with open('config.json', 'r') as fs:
                    self.__config_raw = json.load(fs)
            except FileNotFoundError:
                self.__logger.info("Generating empty config...")
                config = {
                    "TOKEN": "",
                    "Debug": False
                }
                with open('./config.json', 'w') as fs:
                    json.dump(config, fs, indent=2)
                self.__logger.info("Done!Go fill your config now!")
                exit()
            except json.decoder.JSONDecodeError as e1:
                self.__logger.error(
                    "Can't load config.json: JSON decode error:{0}".format(str(e1.args)))
                self.__logger.error("Check your config format and try again.")
                exit()
        self.TOKEN = self.__config_raw['TOKEN']
        self.Debug = self.__config_raw['Debug']
