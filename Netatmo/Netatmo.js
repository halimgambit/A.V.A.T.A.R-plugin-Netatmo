import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export async function init () {
    await Avatar.lang.addPluginPak('Netatmo');
}

export async function action(data, callback) {
    try {
        const L = await Avatar.lang.getPak('Netatmo', data.language);

        const tblActions = {
            getAir: () => getAirQuality(data.client, L, callback)
        };

        info("Netatmo:", data.action.command, "plugin.from", data.client);

        if (tblActions[data.action.command]) {
            await tblActions[data.action.command]();
        } else {
            callback();
        }

    } catch (err) {
        if (data.client) Avatar.Speech.end(data.client);
        if (err.message) error(err.message);
        callback();
    }
}


const refreshNetatmoToken = async (L) => {
    try {
        const cfg = Config.modules.Netatmo;

        info("Netatmo : Token expiré ou invalide. Tentative de rafraîchissement...");

        const params = new URLSearchParams();
        params.append("grant_type", "refresh_token");
        params.append("refresh_token", cfg.refresh_token);
        params.append("client_id", cfg.client_id);
        params.append("client_secret", cfg.client_secret);

        const res = await fetch("https://api.netatmo.com/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params
        });

        const json = await res.json();

        if (json.error) {
            throw new Error(L.get("speech.errorToken", json.error_description || json.error));
        }

        cfg.access_token = json.access_token;
        cfg.refresh_token = json.refresh_token;

        const configFilePath = path.join(process.cwd(), "resources", "app", "core", "plugins", "Netatmo", "Netatmo.prop"); 
        const fileContent = { modules: { Netatmo: Config.modules.Netatmo } };

        fs.writeFile(configFilePath, JSON.stringify(fileContent, null, 2), "utf8", (err) => {
            if (err) {
                error(L.get("speech.errorFile"), err);
            } else {
                info("Netatmo : Fichier de configuration mis à jour avec les nouveaux tokens !");
            }
        });

        return json.access_token;

    } catch (err) {
        error("NETATMO REFRESH ERROR:", err.message || err);
        throw err;
    }
};


const getAirQuality = async (client, L, callback, isRetry = false) => {
    try {
        const cfg = Config.modules.Netatmo;

        const res = await fetch(
            `https://api.netatmo.com/api/gethomecoachsdata?device_id=${cfg.device_id}`,
            {
                headers: {
                    Authorization: `Bearer ${cfg.access_token}`
                }
            }
        );

        if ((res.status === 401 || res.status === 403) && !isRetry) {
            await refreshNetatmoToken(L);
            return getAirQuality(client, L, callback, true);
        }

        const json = await res.json();

        if (json.error) {
            if (json.error.code === 2 && !isRetry) { 
                await refreshNetatmoToken(L);
                return getAirQuality(client, L, callback, true);
            }
            throw new Error(json.error.message);
        }

        if (!json.body || !json.body.devices || json.body.devices.length === 0) {
            throw new Error(L.get("speech.errorApi"));
        }

        const d = json.body.devices[0].dashboard_data;
        const analysis = analyzeAir(d);

        let airText = "";
        if (analysis.airStatus === "bon") airText = L.get("speech.good");
        if (analysis.airStatus === "moyen") airText = L.get("speech.middle");
        if (analysis.airStatus === "mauvais") airText = L.get("speech.bad");

        const finalSpeech = L.get("speech.text", airText, d.Temperature, d.Humidity);

        info(finalSpeech);

        Avatar.speak(finalSpeech, client, () => {
            Avatar.Speech.end(client),
            callback();
        });

    } catch (err) {
        error("NETATMO DEBUG:", err.message || err);
        Avatar.speak(L.get("speech.errorAccess"), client, () => {
            Avatar.Speech.end(client);
            callback();
        });
    }
};


const analyzeAir = (d) => {
    const co2 = d.CO2;
    const temp = d.Temperature;
    const humidity = d.Humidity;
    const noise = d.Noise;

    let airStatus = "bon";
    if (co2 > 1000) airStatus = "mauvais";
    else if (co2 > 800) airStatus = "moyen";

    let comfort = "correct";
    if (humidity > 70 || humidity < 30) comfort = "désagréable";

    return { airStatus, comfort };
};
