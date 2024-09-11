const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const fs = require('fs');
const path = require('path');
require('dotenv').config()
const queue = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song')
    .addStringOption(option =>
      option.setName('song')
        .setDescription('The song title or URL to play')
        .setRequired(true)),
  async execute(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply('You need to be in a voice channel to play music!');
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
      return interaction.reply('I need permissions to join and speak in your voice channel!');
    }

    const song = await getSongInfo(interaction.options.getString('song'));
    if (!song) {
      return interaction.reply('Error finding the song. Please try again with a different query.');
    }

    let serverQueue = queue.get(interaction.guildId);

    if (!serverQueue) {
      serverQueue = {
        textChannel: interaction.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true,
      };

      queue.set(interaction.guildId, serverQueue);
    }

    serverQueue.songs.push(song);

    if (!serverQueue.connection) {
      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        serverQueue.connection = connection;
        await interaction.reply(`Added to queue: **${song.title}**`);
        play(interaction.guild, serverQueue.songs[0]);
      } catch (err) {
        console.error(err);
        queue.delete(interaction.guildId);
        return interaction.reply('There was an error connecting to the voice channel!');
      }
    } else {
      return interaction.reply(`Added to queue: **${song.title}**`);
    }
  },
};

async function getSongInfo(query) {
  try {
    if (ytdl.validateURL(query)) {
      const songInfo = await ytdl.getInfo(query);
      return {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
      };
    } else {
      const {videos} = await ytSearch(query);
      if (videos.length > 0) {
        return {
          title: videos[0].title,
          url: videos[0].url,
        };
      }
    }
  } catch (error) {
    console.error('Error getting song info:', error);
  }
  return null;
}

function play(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const filename = path.join(__dirname, '..', 'temp', `${Date.now()}.mp3`);
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