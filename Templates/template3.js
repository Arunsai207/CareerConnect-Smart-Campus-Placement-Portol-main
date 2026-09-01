$(document).ready(function () {
    $('.t3 .one').css('border', '3px solid white');
    $('.t3 .pelement').click(function () {
        $('.t3 .pelement').css('border', '3px solid transparent');
        $(this).css('border', '3px solid white');
        $('.t3 .left_side').css('background-color', $(this).css('background-color'));
        $('.t3 .section h2.title2').css('color', $(this).css('background-color'));
    });
});
