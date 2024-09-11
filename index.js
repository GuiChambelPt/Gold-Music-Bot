require('dotenv').config()
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const prefix = process.env.BOT_PREFIX;
const queue = new Map();

client.once('ready', () => {
  console.log('Bot is ready!');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const serverQueue = queue.get(message.guild.id);
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'play':
      execute(message, serverQueue);
      break;
    case 'stop':
      stop(message, serverQueue);
      break;
    case 'skip':
      skip(message, serverQueue);
      break;
    case 'queue':
      showQueue(message, serverQueue);
      break;
  }
});

async function execute(message, serverQueue) {
  const args = message.content.split(' ');
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.channel.send('You need to be in a voice channel to play music!');
  }

  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
    return message.channel.send('I need permissions to join and speak in your voice channel!');
  }

  const songInfo = await ytdl.getInfo(args[1]);
  const song = {
    title: songInfo.videoDetails.title,
    url: songInfo.videoDetails.video_url,
  };

  if (!serverQueue) {
    const queueConstruct = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true,
    };

    queue.set(message.guild.id, queueConstruct);
    queueConstruct.songs.push(song);

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });
      queueConstruct.connection = connection;
      play(message.guild, queueConstruct.songs[0]);
    } catch (err) {
      console.error(err);
      queue.delete(message.guild.id);
      return message.channel.send('There was an error connecting to the voice channel!');
    }
  } else {
    serverQueue.songs.push(song);
    return message.channel.send(`${song.title} has been added to the queue!`);
  }
}

function play(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const filename = path.join(__dirname, 'temp', `${Date.now()}.mp3`);
  ytdl(song.url, { filter: 'audioonly' })
    .pipe(fs.createWriteStream(filename))
    .on('finish', () => {
      const resource = createAudioResource(filename);
      const player = createAudioPlayer();

      player.play(resource);
      serverQueue.connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => {
        fs.unlinkSync(filename);
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
      });

      serverQueue.textChannel.send(`Start playing: **${song.title}**`);
    });
}

function stop(message, serverQueue) {
  if (!message.member.voice.channel) {
    return message.channel.send('You have to be in a voice channel to stop the music!');
  }
  
  if (!serverQueue) {
    return message.channel.send('There is no song playing!');
  }
  
  serverQueue.songs = [];
  serverQueue.connection.destroy();
  queue.delete(message.guild.id);
  message.channel.send('Stopped the music and left the voice channel!');
}

function skip(message, serverQueue) {
  if (!message.member.voice.channel) {
    return message.channel.send('You have to be in a voice channel to skip the music!');
  }
  if (!serverQueue) {
    return message.channel.send('There is no song that I could skip!');
  }
  serverQueue.connection.destroy();
  play(message.guild, serverQueue.songs[1]);
  message.channel.send('Skipped the current song!');
}

function showQueue(message, serverQueue) {
  if (!serverQueue) {
    return message.channel.send('There is no song in the queue!');
  }
  let queueList = serverQueue.songs.map((song, index) => `${index + 1}. ${song.title}`).join('\n');
  message.channel.send(`**Current queue:**\n${queueList}`);
}

client.login(process.env.BOT_TOKEN);