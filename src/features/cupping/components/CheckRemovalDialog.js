import React from 'react';
import {SafeAreaView,ScrollView,StyleSheet,View} from 'react-native';
import {CloseButton} from '../../../components/ui/IconButton';
import {full_page_button as FullPageButton} from '../../../components/ui/full_page_button';
import {TypographyAuditText as Text} from '../../../components/ui/TypographyAuditText';
import {colors} from '../../../theme/colors';
import {spacing} from '../../../theme/spacing';
import {typography} from '../../../theme/typography';

export function CheckRemovalDialog({mode='verify',purpose='removal',busy=false,message='',onAction,onClose}){
 const save=mode==='save',retry=mode==='retry',reassignment=purpose==='reassignment',clear=mode==='clear'&&reassignment;
 return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.backdrop}>
  <View style={styles.dialog} accessibilityViewIsModal>
   <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{clear?'Reassign Cup':save?reassignment?'Save clear':'Save removal':retry?reassignment?'Retry clear':'Retry removal':'Check Cup'}</Text>
    <CloseButton accessibilityLabel={reassignment?'Close reassignment dialog':'Close removal dialog'} onPress={onClose} disabled={busy}/></View>
   <Text style={styles.message}>{message||(clear?'Scan the same cup to clear its previous assignment. New coffee details will not be written yet.':save?reassignment?'The clear is verified. Retry saving it; no cup write is needed.':'The clear is verified. Retry saving the removal; no cup write is needed.':retry?
    'The original assignment is still on this cup. Retry clearing it, then scan again to verify.':'Scan the same cup again to verify its sample assignment was cleared.')}</Text>
   <FullPageButton label={clear?'SCAN CUP TO CLEAR':save?'RETRY SAVE':retry?'RETRY CLEAR':'RESCAN TO VERIFY'} onPress={onAction} loading={busy} disabled={busy}
    accessibilityLabel={clear?'Scan same cup to clear previous assignment':save?reassignment?'Retry saving verified clear':'Retry saving verified removal':retry?'Retry clearing sample assignment':'Rescan cup to verify removal'} style={save?null:styles.scanButton}/>
  </View></ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'rgba(0, 0, 0, 0.35)'},
 backdrop:{flexGrow:1,justifyContent:'center',padding:spacing.md},
 dialog:{borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface,padding:spacing.md,gap:spacing.sm},
 heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.sm},
 title:{...typography.text_section_title,flexShrink:1},message:{...typography.text_secondary_body},scanButton:{backgroundColor:colors.action},
});
