import fetch from "node-fetch";

export async function init () {
    await Avatar.lang.addPluginPak('Netatmo');
}

export async function action(data, callback) {

    try {

        const L = await Avatar.lang.getPak('Netatmo', data.language);

        const tblActions = {
            getAir: () => getAirQuality(data.client, L)
        };

        info("Netatmo:", data.action.command, "plugin.from", data.client);

        if (tblActions[data.action.command]) {
            await tblActions[data.action.command]();
        }

    } catch (err) {
        if (data.client) Avatar.Speech.end(data.client);
        if (err.message) error(err.message);
    }

    callback();
}

const getAirQuality = async (client, L) => {

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

        const json = await res.json();

        if (json.error) {
            throw new Error(json.error.message);
        }

        if (!json.body || !json.body.devices || json.body.devices.length === 0) {
            throw new Error(L.get("speech.errorApi"));
        }

        const d = json.body.devices[0].dashboard_data;

        const analysis = analyzeAir(d);

let text = "";

if (analysis.airStatus === "bon") {
    text = L.get("speech.good");
}

if (analysis.airStatus === "moyen") {
    text = L.get("speech.middle");
}

if (analysis.airStatus === "mauvais") {
    text = L.get("speech.bad");
}

info(L.get("speech.text", text, d.Temperature, d.Humidity));

Avatar.speak(L.get("speech.text", text, d.Temperature, d.Humidity), client, () => Avatar.Speech.end(client));

    } catch (err) {
       error("NETATMO DEBUG:", err.message || err);
        Avatar.speak(L.get("speech.errorAccess"), client, () => Avatar.Speech.end(client)
        );
    }
};

function analyzeAir(d) {

    const co2 = d.CO2;
    const temp = d.Temperature;
    const humidity = d.Humidity;
    const noise = d.Noise;

    let airStatus = "bon";

    if (co2 > 1000) airStatus = "mauvais";
    else if (co2 > 800) airStatus = "moyen";

    let comfort = "correct";

    if (humidity > 70 || humidity < 30) comfort = "désagréable";

    return {
        airStatus,
        comfort
    };
}