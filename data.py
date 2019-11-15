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
import os


class ServerConfig:
    def __init__(self, channel, lang):
        self.channel = channel
        self.lang = lang


class Data:
    def __init__(self):
        self.__logger = logging.getLogger("Config")
        logging.basicConfig(
            format="[%(asctime)s][%(levelname)s][%(name)s] %(message)s", level=logging.INFO)
        self.__logger.info("Loading Data...")
        if not os.path.isfile("./vlogdata.json"):
            with open("./vlogdata.json", "w") as fs:
                fs.write("{}")
        try:
            with open("./vlogdata.json", "r") as fs:
                self.__data_raw = json.load(fs)
        except json.decoder.JSONDecodeError as e1:
            self.__logger.error(
                "Can't load vlogdata.json: JSON decode error:{0}".format(str(e1.args)))
            self.__logger.info("Maybe it's an old data, trying to migrate...")
            try:
                with open("./vlogdata.json", "r") as fs:
                    self.__data_raw = eval(fs.read())
                self.__saveData()
            except SyntaxError:
                self.__logger.error("Can't load vlogdata.json: Syntax Error")
                exit()

    def getData(self, server):
        if server not in self.__data_raw:
            self.setData(server)
        return ServerConfig(self.__data_raw[server]['channel'], self.__data_raw[server]['lang'])

    def setData(self, server, channel="-1", lang="en_US"):
        self.__data_raw[server] = {"channel": channel, "lang": lang}
        self.__saveData()

    def setLang(self, server, lang):
        self.__data_raw[server]['lang'] = lang
        self.__saveData()

    def __saveData(self):
        with open("./vlogdata.json", "w") as fs:
            json.dump(self.__data_raw, fs, indent=2)
