package main;

use strict;
use warnings;

use vars qw(%defs);

sub myUtils_AlexaRecovery_Initialize($) {
  return undef;
}

sub AlexaRecovery_Decide($$$) {
  my ($device_exists, $process_running, $attempted) = @_;

  return 'device_missing' if !$device_exists;
  return 'healthy' if $process_running;
  return 'already_attempted' if $attempted;
  return 'start';
}

sub AlexaRecovery_Check(;$) {
  my ($name) = @_;
  $name = 'alexa' if !defined($name) || $name eq '';

  my $hash = $defs{$name};
  if (!$hash) {
    main::Log3('global', 2, 'AlexaRecovery: FHEM-Geraet alexa fehlt; kein Startversuch');
    return 'device_missing';
  }

  my $pid = $hash->{PID};
  my $process_running = $pid && kill(0, $pid) ? 1 : 0;
  my $attempted = main::ReadingsNum($name, 'alexaRecoveryAttempted', 0) ? 1 : 0;
  my $decision = AlexaRecovery_Decide(1, $process_running, $attempted);
  my $previous_state = main::ReadingsVal($name, 'alexaRecoveryState', 'unknown');

  if ($decision eq 'healthy') {
    my $result = $attempted ? 'successful' : 'healthy';
    main::readingsBeginUpdate($hash);
    main::readingsBulkUpdate($hash, 'alexaRecoveryAttempted', 0, 0);
    main::readingsBulkUpdate($hash, 'alexaRecoveryState', 'healthy', 0);
    main::readingsBulkUpdate($hash, 'alexaRecoveryLastResult', $result, 0)
      if $attempted || $previous_state ne 'healthy';
    main::readingsEndUpdate($hash, 1);
    return 'healthy';
  }

  if ($decision eq 'already_attempted') {
    if ($previous_state ne 'failed') {
      main::readingsBeginUpdate($hash);
      main::readingsBulkUpdate($hash, 'alexaRecoveryState', 'failed', 0);
      main::readingsBulkUpdate($hash, 'alexaRecoveryLastResult', 'process_still_missing', 0);
      main::readingsEndUpdate($hash, 1);
      main::Log3($name, 2, 'AlexaRecovery: Prozess fehlt nach dem einmaligen Startversuch; kein weiterer Versuch');
    }
    return 'already_attempted';
  }

  my $count = main::ReadingsNum($name, 'alexaRecoveryCount', 0) + 1;
  main::readingsBeginUpdate($hash);
  main::readingsBulkUpdate($hash, 'alexaRecoveryAttempted', 1, 0);
  main::readingsBulkUpdate($hash, 'alexaRecoveryState', 'restart_requested', 0);
  main::readingsBulkUpdate($hash, 'alexaRecoveryReason', 'process_missing', 0);
  main::readingsBulkUpdate($hash, 'alexaRecoveryLastAttempt', main::TimeNow(), 0);
  main::readingsBulkUpdate($hash, 'alexaRecoveryLastResult', 'start_requested', 0);
  main::readingsBulkUpdate($hash, 'alexaRecoveryCount', $count, 0);
  main::readingsEndUpdate($hash, 1);

  main::Log3($name, 2, 'AlexaRecovery: ALEXA-FHEM-Prozess fehlt; einmaliger kontrollierter Start');
  my $error = main::CommandSet(undef, "$name start");
  if (defined($error) && $error ne '') {
    main::readingsBeginUpdate($hash);
    main::readingsBulkUpdate($hash, 'alexaRecoveryState', 'failed', 0);
    main::readingsBulkUpdate($hash, 'alexaRecoveryLastResult', 'start_command_failed', 0);
    main::readingsEndUpdate($hash, 1);
    main::Log3($name, 2, "AlexaRecovery: Startbefehl fehlgeschlagen: $error");
    return 'start_failed';
  }

  main::RemoveInternalTimer($name, 'AlexaRecovery_Check');
  main::InternalTimer(main::gettimeofday() + 15, 'AlexaRecovery_Check', $name, 0);
  return 'start';
}

sub AlexaRecovery_AfterReread(;$) {
  my ($name) = @_;
  $name = 'alexa' if !defined($name) || $name eq '';

  my $hash = $defs{$name};
  if ($hash) {
    main::readingsBeginUpdate($hash);
    main::readingsBulkUpdate($hash, 'alexaRecoveryAttempted', 0, 0);
    main::readingsBulkUpdate($hash, 'alexaRecoveryState', 'armed_after_rereadcfg', 0);
    main::readingsBulkUpdate($hash, 'alexaRecoveryReason', 'rereadcfg', 0);
    main::readingsEndUpdate($hash, 1);
  }

  main::RemoveInternalTimer($name, 'AlexaRecovery_Check');
  main::InternalTimer(main::gettimeofday() + 15, 'AlexaRecovery_Check', $name, 0);
  return 'scheduled';
}

1;
