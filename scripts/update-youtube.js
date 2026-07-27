import fs from 'fs/promises';
import { parse, modify, applyEdits } from 'jsonc-parser';

const FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbELDDHGqMbjsA_4Kyd7vMw';
const TARGET = {
    file: 'New_Wild_Cosmos/meta.json',
    keywords: ['New', 'Wild', 'Cosmos'],
    episodeRegex: /\bEP(\d{2})\b/i,
    placeholderYoutube: ['https://youtu.be/9jol5hXX0HA', 'https://youtu.be/xzbwqaou124']
};

async function fetchFeed() {
    const res = await fetch(FEED);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    return await res.text();
}

function parseFeed(xml) {
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let m;

    while ((m = entryRegex.exec(xml)) !== null && entries.length < 2) {
        const body = m[1];
        const title = body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
        const videoId = body.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1]?.trim() || '';
        entries.push({
            title,
            url: `https://youtu.be/${videoId}`
        });
    }

    return entries;
}

(async () => {
    console.log(`[${new Date().toISOString()}] updater started.`);

    const xml = await fetchFeed();
    const videos = parseFeed(xml);

    console.log(`Fetched ${videos.length} videos.`);

    const text = await fs.readFile(TARGET.file, 'utf8');

    const json = parse(text);

    const edits = [];
    const updated = [];

    for (const video of videos) {
        console.log(`Checking: ${video.title}`);

        const ok = TARGET.keywords.every((k) => video.title.includes(k));
        if (!ok) {
            console.log('  Skip: keywords not matched.');
            continue;
        }

        const match = video.title.match(TARGET.episodeRegex);
        if (!match) {
            console.log('  Skip: episode number not found.');
            continue;
        }

        const epNum = Number(match[1]);
        const index = json.episodes.findIndex((e) => Number(e.num) === epNum);
        if (index === -1) {
            console.log(`  Skip: EP${epNum} not found.`);
            continue;
        }

        const current = json.episodes[index].youtube;
        if (!TARGET.placeholderYoutube.includes(current)) {
            console.log(`  Skip: EP${epNum} current URL is not placeholder.`);
            continue;
        }

        if (current === video.url) {
            console.log(`  Skip: EP${epNum} already updated.`);
            continue;
        }

        console.log(`  EP${epNum}: ${current} -> ${video.url}`);
        edits.push(...modify(text, ['episodes', index, 'youtube'], video.url));
        updated.push(epNum);
    }

    if (updated.length === 0) {
        console.log('No changes.');
        console.log('updated=');
        return;
    }

    const newText = applyEdits(text, edits);
    await fs.writeFile(TARGET.file, newText, 'utf8');

    console.log(`Updated episodes: ${updated.join(', ')}`);
    console.log(`updated=${updated.join(',')}`);
    console.log(`[${new Date().toISOString()}] updater completed.`);
})();
