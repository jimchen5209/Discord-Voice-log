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
            self.__configraw = {
                "TOKEN": "",
                "Debug": False
            }
        else:
            try:
                with open('config.json','r') as fs:
                    self.__configraw = json.load(fs)
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
        self.TOKEN = self.__configraw['TOKEN']
        self.Debug = self.__configraw['Debug']
