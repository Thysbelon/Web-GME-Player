#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include <gme.h>
#include <emscripten/emscripten.h>

//#include <math.h> //for sin

void handle_error( const char* str );
/*draft*/
// javascript ccall program flow:
// generatePCMfileAndReturnInfo (use multi channel if panning?)
// if onceInPage: emscripten_force_exit

static const uint16_t SAMPLE_RATE=44100;

static bool stereo;
static bool multitrack=false;
static Music_Emu* emu;

void createNewEmu(const unsigned int newSampleRate, bool panning) {
	gme_type_t file_type;
	gme_identify_file( "/home/web_user/input", &file_type ); //?
	//switch(file_type) {
	//	case gme_ay_type:
	//	case gme_kss_type:
	//	case gme_nsf_type:
	//	case gme_nsfe_type:
	//	case gme_sap_type:
	//		stereo=false; break;
	//	default: stereo=true;
	//}
	if (file_type == gme_ay_type || file_type == gme_kss_type || file_type == gme_nsf_type || file_type == gme_nsfe_type || file_type == gme_sap_type ) {
		stereo=false;
	} else {
		stereo=true;
	}
	emu = (panning && !stereo) ? gme_new_emu_multi_channel( file_type, newSampleRate ) : gme_new_emu( file_type, newSampleRate );
	handle_error( gme_load_file( emu, "/home/web_user/input" ) );
	multitrack=gme_type_multitrack( file_type );
}

EMSCRIPTEN_KEEPALIVE
char* generatePCMfileAndReturnInfo(int track, uint8_t speed /*not sure if there is a use case for making this a float*/, bool diffEmu /*determines whether previous emu will be discarded, should be true both when a different file is being used or panning has been switched to on/off */, bool panning, bool onceInPage) {
	// speed: 50 is half speed (slow). 200 is twice the speed (fast). 100 is no change in speed.
	const unsigned int newSampleRate=((float)SAMPLE_RATE/speed)*100;
	if ( multitrack ) { // if an emulator exists (multitrack is false by default, if its 'true' that means an emulator has already been made)
		printf("An emulator already exists.\n");
		if (diffEmu) {
			printf("diffEmu is true. Deleting previous emulator...\n");
			gme_delete( emu );
			createNewEmu(newSampleRate, panning);
		}
	} else {
		printf("An emulator does not already exist.\n");
		//gme_type_t file_type;
		//gme_identify_file( "/home/web_user/input", file_type ); //?
		//switch(file_type) {
		//	case gme_ay_type:
		//	case gme_kss_type:
		//	case gme_nsf_type:
		//	case gme_nsfe_type:
		//	case gme_sap_type:
		//		stereo=false; break;
		//	default: stereo=true;
		//}
		//emu = (panning && !stereo) ? gme_new_emu_multi_channel( file_type, newSampleRate ) : gme_new_emu( file_type, newSampleRate );
		//handle_error( gme_load_file( emu, "/home/web_user/input" ) );
		//multitrack=gme_type_multitrack( file_type );
		createNewEmu(newSampleRate, panning);
	}
	
	gme_info_t* info;
	gme_track_info( emu, &info, track );
	int length=info->length;
	if (length == -1) {
		printf("file length is undefined, try adding intro_length and loop_length\n");
		length = info->intro_length + info->loop_length;
		printf("new length: %d\n", length);
		if (length == -2) {
			printf("intro length and loop length were both undefined. setting to 150000\n");
			length = 150000;
			printf("new length: %d\n", length);
		}
	}
	int loopStart=info->intro_length;
	printf("current emulator is %s\n", info->system);
	gme_free_info(info);
	
	// start track and write samples to file here.
	handle_error( gme_start_track( emu, track ) );
	int8_t totalVoices=gme_voice_count( emu ); //?
	const uint16_t framesPerBuffer=panning ? 64 : 1024; // maybe framesPerBuffer and bufferSize should stay between runs of a multitrack file
	const uint16_t bufferSize=(panning && !stereo) ? (framesPerBuffer /*frames*/ * totalVoices * 2 /*channels*/) : (framesPerBuffer * 2 /*channels*/); // a frame is a group of one sample for each instrument
	const unsigned int totalFrames=(length * newSampleRate) / 1000;
	printf("(length %d * newSampleRate %d) / 1000: totalFrames %d", length, newSampleRate, totalFrames);
	FILE* pcmOut;
	pcmOut=fopen("pcmOut.raw", "wb");
	for (int i=0; i*framesPerBuffer<totalFrames; ++i) {
		short buf[bufferSize]; // array of int 16
		gme_play(emu, bufferSize, buf);
		unsigned int totalFramesLeft= totalFrames - i * bufferSize;
		unsigned int numOfFramesToWrite = (bufferSize > totalFramesLeft) ? totalFramesLeft : bufferSize;
		fwrite(buf, 2, numOfFramesToWrite, pcmOut);
	}
	fclose(pcmOut);
	
	length= /*length/(speed/100)*/ ((float)length/speed)*100; // speed adjusted length for javascript audiobuffers and nodes
	// max length string (could be reduced slightly with hex): "2147483647, 2147483647, 0, 13, Square 1, Square 2, Triangle, Noise, DMC, Wave 1, Wave 2, Wave 3, Wave 4, Wave 5, Wave 6, Wave 7, Wave 8"
	//char trackInfo[135]; // information that js will need to gen audiobuffers and nodes
	//snprintf( trackInfo, 135, "%d, %d, %d, %i", length, loopStart, stereo, totalVoices );
	//for (int i=0;i<totalVoices;++i) {
	//	strcat( trackInfo, ", " );
	//	strcat( trackInfo, gme_voice_name( emu, i ) );
	//}
	const uint8_t trackInfoSize= panning ? 135 : 25;
	char trackInfo[trackInfoSize]; // information that js will need to gen audiobuffers and nodes
	snprintf( trackInfo, trackInfoSize, "%d, %d, %d", length, loopStart, stereo );
	if (panning) {
		char tempTotalVoices[4];
		snprintf( tempTotalVoices, 4, ", %i", totalVoices );
		strcat( trackInfo, tempTotalVoices );
		for (int i=0;i<totalVoices;++i) {
			strcat( trackInfo, ", " );
			strcat( trackInfo, gme_voice_name( emu, i ) );
		}
	}
	
	if (!multitrack) {gme_delete( emu );}
	
	if (onceInPage) {emscripten_force_exit(0);} // I believe trackInfo should still be returned to JS. If not, we can write trackInfo to another file.
	
	return trackInfo; // Wreturn-stack-address shouldn't be an issue because this is going straight to JavaScript.
}

void handle_error( const char* str )
{
	if ( str )
	{
		printf( "Error: %s\n", str ); //getchar();
		//exit( EXIT_FAILURE );
	}
}